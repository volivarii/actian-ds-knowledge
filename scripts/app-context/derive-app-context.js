"use strict";
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const {
  markdownToRecord,
  splitFrontmatter,
  parseBodySections,
  sectionProse,
  sectionBullets,
  stableStringify,
  unescapeMarkdownText,
  writeAtomic,
} = require("./lib");

// Reverse the WYSIWYG editor's serializer artifacts as the body is derived into
// the consumer-facing dist: unescape CommonMark punctuation escapes
// (`data\_product` → `data_product`) and trim surrounding whitespace. The trim
// must be symmetric: a file that has a blank line after its frontmatter fence
// keeps it across an editor save (the assembler adds none, the screen restores
// the one that was there), so the verbatim field body can arrive with a
// LEADING newline a trailing-only strip would leak into the dist. Field bodies
// are single-block prose, so trimming both ends is safe and keeps the dist
// stable across authoring tools. No-op on hand-authored sources.
function normalizeBodyField(text) {
  return unescapeMarkdownText(String(text || "")).trim();
}

// Field-mode derive (entities/patterns): read the record, then normalize the
// verbatim body field. markdownToRecord stays a pure inverse; normalization is
// applied here, at the derive boundary.
function deriveFieldRecord(text, bodyField) {
  const rec = markdownToRecord(text, { bodyField });
  rec[bodyField] = normalizeBodyField(rec[bodyField]);
  return rec;
}

// 2 as of the relationship-vocabulary change: `entities[*].relationships[verb]`
// went from a target slug to a LIST of target slugs, which is a
// schema-incompatible change to the file shape, and the dist schema's own rule
// is to bump on exactly that. A consumer reading a verb's value as a string
// needs a signal, and this is the only one it gets.
const SCHEMA_VERSION = 2;
const META = {
  auto_generated: true,
  source: "scripts/app-context/derive-app-context.js",
  do_not_edit: "Edit the app-context/src/ files; CI regenerates this file.",
};

const KINDS = {
  apps: { dir: "apps", mode: "sections" },
  entities: { dir: "entities", mode: "field", bodyField: "description" },
  patterns: { dir: "patterns", mode: "field", bodyField: "description" },
  personas: { dir: "personas", mode: "field", bodyField: "description" },
};

function findSection(sections, title) {
  const want = title.toLowerCase();
  return sections.find((s) => s.title.toLowerCase() === want) || null;
}

// Build the consumer-facing app record in the canonical key order:
// label, purpose, users, header, sidebar, signals, useCases. (Order is
// load-bearing — it is the dist's JSON key order; see the byte-compat gate.)
// `users` holds its slot here and joinPersonas fills it, because a persona's
// `apps` is the only place that fact is authored.
function assembleAppRecord(fm, sections) {
  const purpose = findSection(sections, "Purpose");
  const signals = findSection(sections, "Signals");
  return {
    label: fm.label,
    purpose: purpose ? unescapeMarkdownText(sectionProse(purpose.lines)) : "",
    users: [],
    header: fm.header,
    sidebar: fm.sidebar,
    signals: signals
      ? sectionBullets(signals.lines).map(unescapeMarkdownText)
      : [],
    useCases: Array.isArray(fm.useCases) ? fm.useCases : [],
  };
}

function readKind(srcDir, kind) {
  const cfg = KINDS[kind];
  const dir = path.join(srcDir, cfg.dir);
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()) {
    const slug = file.replace(/\.md$/, "");
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    if (cfg.mode === "sections") {
      const { data, body } = splitFrontmatter(text);
      if (data.slug !== slug) {
        throw new Error(
          `${kind}/${file}: slug "${data.slug}" != filename "${slug}"`,
        );
      }
      const sections = parseBodySections(body);
      // Refused rather than ignored: an ignored list would sit in the file
      // looking authoritative while the dist said something else.
      if (findSection(sections, "Users")) {
        throw new Error(
          `${kind}/${file}: "## Users" is no longer authored in an app file. ` +
            `Who uses an app comes from the personas that list it: add "${slug}" ` +
            `to the apps of each persona in app-context/src/personas/.`,
        );
      }
      out[slug] = assembleAppRecord(data, sections);
      continue;
    }
    const rec = deriveFieldRecord(text, cfg.bodyField);
    if (rec.slug !== slug) {
      throw new Error(
        `${kind}/${file}: slug "${rec.slug}" != filename "${slug}"`,
      );
    }
    // Strip authoring-only keys; keep the consumer-facing shape.
    delete rec._schema_version;
    delete rec.slug;
    out[slug] = rec;
  }
  return out;
}

function readTerminology(srcDir) {
  const p = path.join(srcDir, "terminology.yml");
  if (!fs.existsSync(p)) return {};
  const doc = YAML.parse(fs.readFileSync(p, "utf8")) || {};
  return doc.terms || {};
}

// Personas own the join between an app and the people who use it. An app's
// `users` is the sorted labels of the personas whose `apps` include it. A
// persona's `useCases` is every app use case whose `audience` names its label,
// with the app it belongs to, in app-slug then authored order. Jobs are read
// from the app, never restated on the persona. Mutates and returns both maps.
function joinPersonas(apps, personas) {
  for (const [appSlug, app] of Object.entries(apps)) {
    app.users = Object.values(personas)
      .filter((p) => Array.isArray(p.apps) && p.apps.includes(appSlug))
      .map((p) => p.label)
      .sort();
  }
  for (const persona of Object.values(personas)) {
    const useCases = [];
    for (const appSlug of Object.keys(apps).sort()) {
      for (const uc of apps[appSlug].useCases || []) {
        if (!(uc.audience || []).includes(persona.label)) continue;
        const entry = { app: appSlug, jobs: uc.jobs };
        if (Array.isArray(uc.patterns)) entry.patterns = uc.patterns;
        useCases.push(entry);
      }
    }
    persona.useCases = useCases;
  }
  return { apps, personas };
}

function deriveToObject(srcDir) {
  const apps = readKind(srcDir, "apps");
  const personas = readKind(srcDir, "personas");
  joinPersonas(apps, personas);
  return {
    _schema_version: SCHEMA_VERSION,
    _meta: META,
    apps,
    entities: readKind(srcDir, "entities"),
    terminology: readTerminology(srcDir),
    patterns: readKind(srcDir, "patterns"),
    personas,
  };
}

function runCli(argv) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const srcDir = path.join(repoRoot, "app-context", "src");
  const distDir = path.join(repoRoot, "app-context", "dist");
  const dist = deriveToObject(srcDir);
  const { validateAppContext } = require("./validate-app-context");
  const { errors } = validateAppContext(dist);
  if (errors.length) {
    console.error("app-context integrity errors:\n" + errors.join("\n"));
    return 1;
  }
  // Sections first: per-slug dist leaves, validated against
  // schemas/app-context-section.json, cross-checked against the apps/patterns
  // just derived. Recipes reference them and the derive inlines them below.
  const {
    readSections,
    checkSectionReferences,
    writeSections,
  } = require("./derive-sections");
  const sectionSchema = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "schemas", "app-context-section.json"),
      "utf8",
    ),
  );
  const { sections, errors: sectionErrors } = readSections(srcDir, sectionSchema);
  const sectionRefErrors = checkSectionReferences(sections, dist);
  const allSectionErrors = sectionErrors.concat(sectionRefErrors);
  if (allSectionErrors.length) {
    console.error("app-context section errors:\n" + allSectionErrors.join("\n"));
    return 1;
  }
  const sectionsBySlug = {};
  for (const s of sections) sectionsBySlug[s.slug] = s;

  // Recipes: per-slug dist leaves, validated against schemas/app-context-recipe.json
  // and cross-checked against the apps/patterns just derived above. SECTION
  // nodes are spliced out here, so dist recipes stay whole skeletons.
  const {
    readRecipes,
    checkReferences,
    writeRecipes,
    inlineSections,
  } = require("./derive-recipes");
  const recipeSchema = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "schemas", "app-context-recipe.json"),
      "utf8",
    ),
  );
  const { recipes, errors: recipeErrors } = readRecipes(srcDir, recipeSchema);
  const inlined = [];
  const inlineErrors = [];
  for (const r of recipes) {
    const res = inlineSections(r, sectionsBySlug);
    inlineErrors.push(...res.errors);
    inlined.push(res.recipe);
  }
  const refErrors = checkReferences(inlined, dist);
  const allRecipeErrors = recipeErrors.concat(inlineErrors, refErrors);
  if (allRecipeErrors.length) {
    console.error(
      "app-context recipe errors:\n" + allRecipeErrors.join("\n"),
    );
    return 1;
  }

  writeAtomic(path.join(distDir, "app-context.json"), stableStringify(dist));
  writeAtomic(
    path.join(distDir, "app-context.bundle.json"),
    stableStringify({
      _schema_version: SCHEMA_VERSION,
      _meta: META,
      appContext: dist,
    }),
  );
  const sectionCount = writeSections(distDir, sections, META);
  console.log("derived app-context sections: " + sectionCount);
  const recipeCount = writeRecipes(distDir, inlined, META);
  console.log("derived app-context recipes: " + recipeCount);

  require("./manifest-update").updatePathsManifest(
    path.join(repoRoot, "paths-manifest.json"),
  );
  console.log("derived app-context dist");
  return 0;
}

module.exports = {
  deriveToObject,
  assembleAppRecord,
  deriveFieldRecord,
  joinPersonas,
  runCli,
};
