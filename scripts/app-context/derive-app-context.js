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
// must be symmetric: the editor save (assembleFrontmatterFile) injects a blank
// line AFTER the frontmatter fence, so the verbatim field body arrives with a
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
};

function findSection(sections, title) {
  const want = title.toLowerCase();
  return sections.find((s) => s.title.toLowerCase() === want) || null;
}

// Build the consumer-facing app record in the canonical key order:
// label, purpose, users, header, sidebar, signals, useCases. (Order is
// load-bearing — it is the dist's JSON key order; see the byte-compat gate.)
function assembleAppRecord(fm, sections) {
  const purpose = findSection(sections, "Purpose");
  const users = findSection(sections, "Users");
  const signals = findSection(sections, "Signals");
  return {
    label: fm.label,
    purpose: purpose ? unescapeMarkdownText(sectionProse(purpose.lines)) : "",
    users: users ? sectionBullets(users.lines).map(unescapeMarkdownText) : [],
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
      out[slug] = assembleAppRecord(data, parseBodySections(body));
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

function deriveToObject(srcDir) {
  return {
    _schema_version: SCHEMA_VERSION,
    _meta: META,
    apps: readKind(srcDir, "apps"),
    entities: readKind(srcDir, "entities"),
    terminology: readTerminology(srcDir),
    patterns: readKind(srcDir, "patterns"),
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
  // Recipes: per-slug dist leaves, validated against schemas/app-context-recipe.json
  // and cross-checked against the apps/patterns just derived above.
  const {
    readRecipes,
    checkReferences,
    writeRecipes,
  } = require("./derive-recipes");
  const recipeSchema = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "schemas", "app-context-recipe.json"),
      "utf8",
    ),
  );
  const { recipes, errors: recipeErrors } = readRecipes(srcDir, recipeSchema);
  const refErrors = checkReferences(recipes, dist);
  const allRecipeErrors = recipeErrors.concat(refErrors);
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
  const recipeCount = writeRecipes(distDir, recipes, META);
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
  runCli,
};
