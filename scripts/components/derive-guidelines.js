"use strict";

// Derive transformer for the per-component multi-domain guideline architecture.
//
// Phase 1 (additive). Source layout — one directory per component:
//
//   components/src/<slug>/
//     _meta.yml      (required)  component metadata + per-domain status matrix
//     content.md     (optional)  Content guidelines
//     usage.md       (optional)  Usage guidelines
//     design.md      (optional)  Design guidelines
//     behavior.md    (optional)  Behavior / a11y / implementation
//     tokens.yml     (optional)  Component-specific token bindings
//
// `_meta.yml.domains` is the source of truth for each domain's status:
//   draft|approved  → the matching source file MUST exist; it is parsed.
//   inherited       → no body; consumers resolve from category-defaults.
//   not-started     → no body; an explicit "declared but empty" marker.
// A domain omitted from `_meta.yml` is omitted from the output entirely.
//
// Outputs (components/dist/guidelines/):
//   <slug>.json              merged per-component object
//   <registryKey>.json       registry-alias copy (carries `_alias_of`); one
//                            per paths-manifest.json#registryAliases entry, so
//                            consumers resolve a guideline by registry key OR
//                            canonical slug with no per-consumer logic
//   guidelines.bundle.json   one-shot roll-up keyed by slug + registry key
//   coverage.md              component × domain × status matrix + alias table
//
// Mirrors the categories pipeline (scripts/categories/derive-categories.js):
// single-pass projection, Ajv validation, stable byte-identical output (no
// timestamps), stale-dist prune, paths-manifest.json auto-regeneration.

const fs = require("node:fs");
const path = require("node:path");
const identityLedger = require("./derive-identity.js");
const cp = require("node:child_process");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
const yamlParser = require("../lib/frontmatter");
const mdParser = require("./guideline-md-parser");
const { stableStringify, writeAtomic } = require("../lib/dist-io");
const fanoutPatterns = require("../content/fanout-patterns");
const { writeManifest } = require("../lib/manifest-io");

const SCHEMA_VERSION = 1;
const PROSE_DOMAINS = ["content", "usage", "design", "behavior"];
const ALL_DOMAINS = PROSE_DOMAINS.concat(["tokens"]);
const HAS_BODY = new Set(["draft", "approved"]);

// ───────────────────────────────────────────────────────────────────────────
// Schema + validators
// ───────────────────────────────────────────────────────────────────────────

function makeValidators(repoRoot) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const load = (name) =>
    JSON.parse(fs.readFileSync(path.join(repoRoot, "schemas", name), "utf8"));
  return {
    component: ajv.compile(load("guideline-component.json")),
    meta: ajv.compile(load("guideline-meta.json")),
    tokens: ajv.compile(load("guideline-tokens.json")),
  };
}

function assertValid(validator, data, label) {
  if (validator(data)) return;
  const errs = (validator.errors || [])
    .map((e) => (e.instancePath || "(root)") + " " + e.message)
    .join("; ");
  throw new Error(label + " failed schema validation: " + errs);
}

// ───────────────────────────────────────────────────────────────────────────
// YAML helpers (reuse the categories YAML-subset parser)
// ───────────────────────────────────────────────────────────────────────────

// Parse a pure .yml file (no `---` fences) into an object.
function parseYaml(text) {
  return yamlParser.parseFrontmatter(text, 0);
}

// ───────────────────────────────────────────────────────────────────────────
// Per-domain projection
// ───────────────────────────────────────────────────────────────────────────

function metaBlock(sourceRel) {
  return {
    auto_generated: true,
    source: sourceRel,
    do_not_edit: "Edit the per-domain source files; CI regenerates this file.",
  };
}

function deriveGitMtime(repoRoot, slug) {
  const srcDir = path.join(repoRoot, "components", "src", slug);
  if (!fs.existsSync(srcDir)) return null;
  try {
    const out = cp
      .execFileSync(
        "git",
        [
          "log",
          "-1",
          "--format=%cI",
          "--",
          path.join("components", "src", slug),
        ],
        { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] },
      )
      .toString()
      .trim();
    return out || null;
  } catch (err) {
    return null;
  }
}

// Base domain object: status first, then owner/updatedAt from the _meta.yml
// entry (body fields, if any, are appended by the caller — keeps key order
// readable: status → meta → body).
function domainBase(entry) {
  const base = { status: entry.status };
  if (entry.owner != null) base.owner = entry.owner;
  if (entry.updatedAt != null) base.updatedAt = entry.updatedAt;
  return base;
}

// Build one prose-domain output object, reading the source file when the
// status declares a body. `dirAbs` is the component source directory.
function deriveProseDomain(domain, entry, dirAbs, slug) {
  const fileAbs = path.join(dirAbs, domain + ".md");
  const fileExists = fs.existsSync(fileAbs);
  const status = entry.status;

  if (HAS_BODY.has(status)) {
    if (!fileExists) {
      throw new Error(
        slug +
          "/_meta.yml declares domain '" +
          domain +
          "' as " +
          status +
          " but " +
          domain +
          ".md is missing.",
      );
    }
    const parsed = mdParser.parseGuidelineMarkdown(
      fs.readFileSync(fileAbs, "utf8"),
    );
    const out = domainBase(entry);
    out.markdown = parsed.markdown;
    out.sections = parsed.sections;
    return out;
  }

  // inherited | not-started — must NOT carry a body file.
  if (fileExists) {
    throw new Error(
      slug +
        "/" +
        domain +
        ".md exists but _meta.yml declares domain '" +
        domain +
        "' as " +
        status +
        ". Remove the file or change the status to draft/approved.",
    );
  }
  return domainBase(entry);
}

// Build the tokens-domain output object.
function deriveTokensDomain(entry, dirAbs, slug, tokensValidator) {
  const fileAbs = path.join(dirAbs, "tokens.yml");
  const fileExists = fs.existsSync(fileAbs);
  const status = entry.status;

  if (HAS_BODY.has(status)) {
    if (!fileExists) {
      throw new Error(
        slug +
          "/_meta.yml declares domain 'tokens' as " +
          status +
          " but tokens.yml is missing.",
      );
    }
    const data = parseYaml(fs.readFileSync(fileAbs, "utf8"));
    assertValid(tokensValidator, data, slug + "/tokens.yml");
    const out = domainBase(entry);
    out.bindings = data.bindings;
    return out;
  }

  if (fileExists) {
    throw new Error(
      slug +
        "/tokens.yml exists but _meta.yml declares domain 'tokens' as " +
        status +
        ". Remove the file or change the status to draft/approved.",
    );
  }
  return domainBase(entry);
}

// ───────────────────────────────────────────────────────────────────────────
// Derive one component directory
// ───────────────────────────────────────────────────────────────────────────

// `categoryResolver` is an optional (slug) => categorySlug fallback used when
// _meta.yml omits `category` (Phase 1 leaves it unset; the registry lookup
// lands with the consumer migration).
function deriveComponentDir(
  dirAbs,
  slug,
  repoRoot,
  validators,
  categoryResolver,
) {
  const metaAbs = path.join(dirAbs, "_meta.yml");
  if (!fs.existsSync(metaAbs)) {
    throw new Error(slug + "/: missing required _meta.yml");
  }
  const meta = parseYaml(fs.readFileSync(metaAbs, "utf8"));
  assertValid(validators.meta, meta, slug + "/_meta.yml");

  const declared = meta.domains || {};

  // Reject orphan domain files not declared in _meta.yml.
  PROSE_DOMAINS.forEach((d) => {
    if (fs.existsSync(path.join(dirAbs, d + ".md")) && !declared[d]) {
      throw new Error(
        slug + "/" + d + ".md exists but is not declared in _meta.yml domains.",
      );
    }
  });
  if (fs.existsSync(path.join(dirAbs, "tokens.yml")) && !declared.tokens) {
    throw new Error(
      slug + "/tokens.yml exists but is not declared in _meta.yml domains.",
    );
  }

  const domains = {};
  ALL_DOMAINS.forEach((domain) => {
    const entry = declared[domain];
    if (!entry) return; // omitted → omitted from output
    if (domain === "tokens") {
      domains.tokens = deriveTokensDomain(
        entry,
        dirAbs,
        slug,
        validators.tokens,
      );
    } else {
      domains[domain] = deriveProseDomain(domain, entry, dirAbs, slug);
    }
  });

  let category = meta.category;
  if (!category && typeof categoryResolver === "function") {
    category = categoryResolver(slug) || undefined;
  }
  if (!category) {
    throw new Error(
      slug +
        "/_meta.yml: `category` is not set and no registry fallback resolved it.",
    );
  }

  const out = {
    _schema_version: SCHEMA_VERSION,
    _meta: metaBlock("components/src/" + slug + "/"),
    slug: slug,
    component: meta.component,
    meta: { category: category },
    domains: domains,
  };
  if (meta.section != null) out.meta.section = meta.section;
  if (meta.related != null) out.meta.related = meta.related;
  if (Array.isArray(meta.a11y_refs)) {
    out.meta.a11y_refs = meta.a11y_refs.map(function (r) {
      const item = { ref: r.ref };
      if (r.note != null) item.note = r.note;
      return item;
    });
  }
  if (Array.isArray(meta.examples)) {
    out.meta.examples = meta.examples.map(function (e) {
      const item = { label: e.label };
      if (e.figmaNode != null) item.figmaNode = e.figmaNode;
      if (e.url != null) item.url = e.url;
      return item;
    });
  }
  if (typeof meta.lastReviewed === "string") {
    out.meta.lastReviewed = meta.lastReviewed;
  }

  const mtime = deriveGitMtime(repoRoot, slug);
  if (mtime) out.updated_at = mtime;

  assertValid(
    validators.component,
    out,
    "components/dist/guidelines/" + slug + ".json",
  );
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Bundle + coverage
// ───────────────────────────────────────────────────────────────────────────

// `aliasDocs` (optional) is a { registryKey: aliasDoc } map — registry-alias
// copies are folded into the bundle alongside the canonical slugs so one-shot
// consumers resolve either key. Each alias entry carries `_alias_of`.
function buildBundle(perComponent, aliasDocs) {
  const bundle = {
    _schema_version: SCHEMA_VERSION,
    _meta: {
      auto_generated: true,
      source: "components/src/*/",
      do_not_edit:
        "Edit the per-domain source files; CI regenerates this bundle.",
    },
    components: {},
  };
  const all = Object.assign({}, perComponent, aliasDocs || {});
  Object.keys(all)
    .sort()
    .forEach((key) => {
      bundle.components[key] = all[key];
    });
  return bundle;
}

// Per-row coverage glyphs. `not-started` renders distinctly from an absent
// domain (which renders "—") so the documentation-debt marker stays visible
// in the per-component table, not just the summary.
const STATUS_GLYPH = {
  approved: "approved",
  draft: "draft",
  inherited: "inherited",
  "not-started": "not started",
};

// Per-component token render-grade tally: how many token bindings carry a valid
// `property` (render-grade) out of the total. Components with no tokens domain
// are omitted. Feeds the coverage report and tracks harvest progress.
function tokenRenderGradeStats(perComponent) {
  const out = {};
  Object.keys(perComponent).forEach((slug) => {
    const doc = perComponent[slug];
    const dom = doc.domains && doc.domains.tokens;
    if (!dom || !Array.isArray(dom.bindings)) return;
    const total = dom.bindings.length;
    const graded = dom.bindings.filter(
      (b) => typeof b.property === "string" && b.property.length > 0,
    ).length;
    out[slug] = { total, graded };
  });
  return out;
}

// `registryAliases` (optional) is the { registryKey: canonicalSlug } map from
// paths-manifest.json — rendered as a visible "Registry aliases" table so the
// interim naming-divergence debt surfaces in the backlog report, not just the
// manifest. See components/src/AUTHORING.md 'Slug naming'.
function buildCoverage(perComponent, registryAliases) {
  const slugs = Object.keys(perComponent).sort();
  const lines = [];
  lines.push("# Component guideline coverage");
  lines.push("");
  lines.push(
    "> Auto-generated by `scripts/components/derive-guidelines.js`. " +
      "Do not edit. This is the documentation-debt backlog: each cell is the " +
      "status of one domain for one component.",
  );
  lines.push("");
  lines.push("| Component | Content | Usage | Design | Behavior | Tokens |");
  lines.push("|---|---|---|---|---|---|");

  const tally = {};
  ALL_DOMAINS.forEach((d) => {
    tally[d] = {
      "not-started": 0,
      draft: 0,
      approved: 0,
      inherited: 0,
      absent: 0,
    };
  });

  slugs.forEach((slug) => {
    const doc = perComponent[slug];
    const cells = ALL_DOMAINS.map((d) => {
      const dom = doc.domains[d];
      if (!dom) {
        tally[d].absent++;
        return "—";
      }
      tally[d][dom.status]++;
      return STATUS_GLYPH[dom.status] || dom.status;
    });
    lines.push("| " + doc.component + " | " + cells.join(" | ") + " |");
  });

  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(
    "| Domain | Approved | Draft | Inherited | Not started | Absent |",
  );
  lines.push("|---|---|---|---|---|---|");
  ALL_DOMAINS.forEach((d) => {
    const t = tally[d];
    lines.push(
      "| " +
        d +
        " | " +
        t.approved +
        " | " +
        t.draft +
        " | " +
        t.inherited +
        " | " +
        t["not-started"] +
        " | " +
        t.absent +
        " |",
    );
  });

  const aliasKeys = Object.keys(registryAliases || {}).sort();
  if (aliasKeys.length > 0) {
    lines.push("");
    lines.push("## Registry aliases");
    lines.push("");
    lines.push(
      "> Interim bridge: a registry component key resolves to a guideline " +
        "authored under a different slug. Each row is naming-divergence debt — " +
        "converge the names (rename the `components/src/<slug>/` directory to " +
        "match the registry key) and the alias self-deletes. See " +
        "`components/src/AUTHORING.md` 'Slug naming'.",
    );
    lines.push("");
    lines.push("| Registry key | Guideline slug |");
    lines.push("|---|---|");
    aliasKeys.forEach((from) => {
      lines.push("| " + from + " | " + registryAliases[from] + " |");
    });
  }

  const rg = tokenRenderGradeStats(perComponent);
  const rgSlugs = Object.keys(rg).sort();
  if (rgSlugs.length) {
    lines.push("");
    lines.push("## Token render-grade");
    lines.push("");
    lines.push(
      "> Bindings carrying a CSS `property` (render-grade) over total token " +
        "bindings, per component. Absent = prose-only, not yet render-grade.",
    );
    lines.push("");
    lines.push("| Component | Render-grade |");
    lines.push("|---|---|");
    rgSlugs.forEach((slug) => {
      const s = rg[slug];
      lines.push(
        "| " +
          perComponent[slug].component +
          " | " +
          s.graded +
          "/" +
          s.total +
          " |",
      );
    });
  }

  lines.push("");
  return lines.join("\n");
}

// ───────────────────────────────────────────────────────────────────────────
// Registry aliases
// ───────────────────────────────────────────────────────────────────────────

// A registry-alias copy: byte-identical to the canonical derived object plus a
// top-level `_alias_of` marker. `slug` stays the canonical slug — only the
// filename (and the bundle key) is the registry key. Spread the canonical so
// any field added to derived docs (updated_at, future ones) automatically
// propagates to alias copies — override only the alias marker.
function buildAliasDoc(canonicalDoc) {
  return Object.assign({}, canonicalDoc, {
    _alias_of: canonicalDoc.slug,
  });
}

// Resolve paths-manifest.json#registryAliases into { registryKey: aliasDoc }.
// Three hygiene guards make the map self-pruning — every naming-convergence
// action a team takes forces the matching alias entry to be removed, and CI
// fails loudly until it is:
//   (collision) `from` is also a real component source dir → the rename
//               converged; the alias is now redundant and must be deleted.
//   (no-op)     `from` === `to` → a half-finished convergence.
//   (dangling)  `to` is not a derived guideline → the canonical guideline was
//               renamed or removed without updating the alias.
function resolveRegistryAliases(registryAliases, perComponent) {
  const out = {};
  const slugSet = new Set(Object.keys(perComponent));
  Object.keys(registryAliases || {}).forEach((from) => {
    const to = registryAliases[from];
    if (from === to) {
      throw new Error(
        "registryAliases: no-op alias '" +
          from +
          "' -> '" +
          to +
          "'. Remove it from paths-manifest.json#registryAliases.",
      );
    }
    if (slugSet.has(from)) {
      throw new Error(
        "registryAliases: '" +
          from +
          "' is both an alias key and a real component guideline slug. The " +
          "naming has converged — delete the '" +
          from +
          "' entry from paths-manifest.json#registryAliases.",
      );
    }
    if (!slugSet.has(to)) {
      throw new Error(
        "registryAliases: '" +
          from +
          "' -> '" +
          to +
          "' but no guideline is derived for '" +
          to +
          "'. Fix the target or remove the alias.",
      );
    }
    out[from] = buildAliasDoc(perComponent[to]);
  });
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Filesystem
// ───────────────────────────────────────────────────────────────────────────

function cleanupStaleDistFiles(distDir, expectedFiles) {
  if (!fs.existsSync(distDir)) return [];
  const pruned = [];
  fs.readdirSync(distDir).forEach((file) => {
    if (expectedFiles.indexOf(file) === -1) {
      const filePath = path.join(distDir, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
        pruned.push(file);
      }
    }
  });
  return pruned;
}

// ───────────────────────────────────────────────────────────────────────────
// paths-manifest.json auto-regeneration
// ───────────────────────────────────────────────────────────────────────────

const MANIFEST_NOTE =
  "components.guidelineDoc.* entries are auto-regenerated by scripts/components/derive-guidelines.js. Do not hand-edit. Per-component merged JSONs + a bundle + a coverage report + collection entries.";

function updatePathsManifest(manifestPath, slugs, opts) {
  opts = opts || {};
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.paths) manifest.paths = {};
  if (!manifest.collections) manifest.collections = {};

  const dropped = [];
  Object.keys(manifest.paths).forEach((k) => {
    if (k.indexOf("components.guidelineDoc.") === 0) {
      dropped.push(k);
      delete manifest.paths[k];
    }
  });

  const added = [];

  manifest.paths["components.guidelineDoc.bundle"] = {
    path: "components/dist/guidelines/guidelines.bundle.json",
    type: "json",
    origin: "ci",
    generator: "scripts/components/derive-guidelines.js",
    description:
      "Roll-up of every per-component multi-domain guideline object, keyed by canonical slug plus any registry-alias keys (alias entries carry _alias_of). One-shot LLM consumption.",
  };
  added.push("components.guidelineDoc.bundle");

  manifest.paths["components.guidelineDoc.coverage"] = {
    path: "components/dist/guidelines/coverage.md",
    type: "markdown",
    origin: "ci",
    generator: "scripts/components/derive-guidelines.js",
    description:
      "Component × domain × status coverage matrix — the documentation-debt backlog.",
  };
  added.push("components.guidelineDoc.coverage");

  slugs
    .slice()
    .sort()
    .forEach((slug) => {
      const key = "components.guidelineDoc." + slug;
      manifest.paths[key] = {
        path: "components/dist/guidelines/" + slug + ".json",
        type: "json",
        origin: "ci",
        generator: "scripts/components/derive-guidelines.js",
        description:
          "Merged multi-domain guideline object for the '" +
          slug +
          "' component (content, usage, design, behavior, tokens — each optional).",
      };
      added.push(key);
    });

  manifest.collections["components.guidelineDoc.byKey"] = {
    dir: "components/dist/guidelines",
    pattern: "{slug}.json",
    type: "json",
    origin: "ci",
    description:
      "Per-component merged guideline objects. See components.guidelineDoc.bundle for the roll-up.",
  };
  manifest.collections["components.guidelineDocSrc"] = {
    dir: "components/src",
    pattern:
      "{slug}/{_meta.yml,content.md,usage.md,design.md,behavior.md,tokens.yml}",
    type: "yaml",
    origin: "human",
    recursive: true,
    description:
      "Authoring surface for per-component guidelines. Each {slug}/ directory holds _meta.yml + optional per-domain files (content.md, usage.md, design.md, behavior.md, tokens.yml). Recursive: covers everything under components/src/ — the per-component {slug}/ trees plus the sibling categories/ and guidelines/ source dirs (which also carry their own collections). See components/src/AUTHORING.md.",
  };

  manifest._notes = manifest._notes || {};
  manifest._notes.guideline_doc_auto = MANIFEST_NOTE;

  if (!opts.dryRun) {
    writeManifest(manifestPath, manifest);
  }
  return { added, dropped, manifest };
}

// ───────────────────────────────────────────────────────────────────────────
// Pipeline
// ───────────────────────────────────────────────────────────────────────────

// A component source directory is any direct child of srcDir that contains
// a _meta.yml. (Other entries — AUTHORING.md, the legacy guidelines/ and
// categories/ trees — are skipped.)
function listComponentDirs(srcDir) {
  if (!fs.existsSync(srcDir)) return [];
  return fs
    .readdirSync(srcDir)
    .filter((name) => {
      const abs = path.join(srcDir, name);
      return (
        fs.statSync(abs).isDirectory() &&
        fs.existsSync(path.join(abs, "_meta.yml"))
      );
    })
    .sort();
}

function derivePipeline(srcDir, distDir, repoRoot, opts) {
  opts = opts || {};
  const validators = opts.validators || makeValidators(repoRoot);
  const categoryResolver = opts.categoryResolver;
  const registryAliases = opts.registryAliases || {};

  const slugs = listComponentDirs(srcDir);
  if (slugs.length === 0) {
    // Phase 1 ships additive: an empty source tree is not an error, it just
    // produces an empty bundle + coverage so the manifest entries exist.
    if (!opts.allowEmpty) {
      throw new Error(
        "No component directories (with _meta.yml) found in " + srcDir,
      );
    }
  }

  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  const perComponent = {};
  const written = [];
  const synthesizedSlugs = [];

  slugs.forEach((slug) => {
    const dirAbs = path.join(srcDir, slug);
    let doc;
    try {
      doc = deriveComponentDir(
        dirAbs,
        slug,
        repoRoot,
        validators,
        categoryResolver,
      );
    } catch (err) {
      throw new Error(
        "Failed to derive components/src/" + slug + "/: " + err.message,
      );
    }
    perComponent[slug] = doc;
    // Write deferred until after pattern fan-out (below) so synthesized
    // components + appended pattern sections land in the same write pass.
  });

  // Pattern fan-out — route content/src/{patterns,product}/*.md sections into
  // related components (per `relatedComponents` + `relatedCategories` frontmatter).
  // Mutates perComponent in place; may add new entries for components that have
  // no components/src/<slug>/ directory (their guideline doc is synthesized
  // entirely from pattern sources). See scripts/content/fanout-patterns.js.
  if (opts.registry && opts.categoriesData && opts.categorySlugFor) {
    const fanoutResult = fanoutPatterns.runFanout(
      repoRoot,
      perComponent,
      opts.registry,
      opts.categoriesData,
      opts.categorySlugFor,
      registryAliases,
    );
    if (fanoutResult.errors.length > 0) {
      throw new Error(
        "Pattern fan-out failed:\n  " + fanoutResult.errors.join("\n  "),
      );
    }
    fanoutResult.summary.synthesized.forEach((s) => synthesizedSlugs.push(s));
  }

  // Single write pass — every entry in perComponent (source-derived OR
  // pattern-synthesized) gets validated + written here. Validation runs
  // post-fanout so the schema sees the final shape (including any appended
  // pattern sections + the new synthesized status).
  const allSlugs = Object.keys(perComponent).sort();
  allSlugs.forEach((slug) => {
    const doc = perComponent[slug];
    assertValid(
      validators.component,
      doc,
      "components/dist/guidelines/" + slug + ".json",
    );
    const distPath = path.join(distDir, slug + ".json");
    writeAtomic(distPath, stableStringify(doc));
    written.push("components/dist/guidelines/" + slug + ".json");
  });

  // Registry-alias copies — emitted after the canonical objects so the guards
  // in resolveRegistryAliases() see the full derived slug set.
  const aliasDocs = resolveRegistryAliases(registryAliases, perComponent);
  const aliasKeys = Object.keys(aliasDocs).sort();
  aliasKeys.forEach((from) => {
    const doc = aliasDocs[from];
    assertValid(
      validators.component,
      doc,
      "components/dist/guidelines/" +
        from +
        ".json (alias of " +
        doc.slug +
        ")",
    );
    writeAtomic(path.join(distDir, from + ".json"), stableStringify(doc));
    written.push("components/dist/guidelines/" + from + ".json");
  });

  const bundle = buildBundle(perComponent, aliasDocs);
  writeAtomic(
    path.join(distDir, "guidelines.bundle.json"),
    stableStringify(bundle),
  );
  written.push("components/dist/guidelines/guidelines.bundle.json");

  const coverage = buildCoverage(perComponent, registryAliases);
  writeAtomic(path.join(distDir, "coverage.md"), coverage + "\n");
  written.push("components/dist/guidelines/coverage.md");

  // Expected dist files = source-derived slugs + synthesized (pattern-only)
  // slugs + alias copies + bundle + coverage. Synthesized entries must be in
  // this set or cleanupStaleDistFiles would prune them as orphans.
  const expectedFiles = ["guidelines.bundle.json", "coverage.md"]
    .concat(allSlugs.map((s) => s + ".json"))
    .concat(aliasKeys.map((k) => k + ".json"));
  const pruned = cleanupStaleDistFiles(distDir, expectedFiles);

  return {
    perComponent,
    aliasDocs,
    bundle,
    coverage,
    written,
    slugs: allSlugs,
    synthesizedSlugs,
    pruned,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI
// ───────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--src") args.src = argv[++i];
    else if (a === "--dist") args.dist = argv[++i];
    else if (a === "--manifest") args.manifest = argv[++i];
    else if (a === "--no-manifest") args.noManifest = true;
    else if (a === "--allow-empty") args.allowEmpty = true;
  }
  return args;
}

function defaultPaths() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  return {
    repoRoot,
    src: path.join(repoRoot, "components", "src"),
    dist: path.join(repoRoot, "components", "dist", "guidelines"),
    manifest: path.join(repoRoot, "paths-manifest.json"),
  };
}

function runCli(argv) {
  const args = parseArgs(argv);
  const d = defaultPaths();
  const srcDir = args.src || d.src;
  const distDir = args.dist || d.dist;
  const manifestPath = args.manifest || d.manifest;

  // registryAliases is an INPUT read from the manifest (distinct from the
  // manifest entries the deriver WRITES). Read it even under --no-manifest;
  // only writing is suppressed by that flag.
  let registryAliases = {};
  if (fs.existsSync(manifestPath)) {
    try {
      registryAliases =
        JSON.parse(fs.readFileSync(manifestPath, "utf8")).registryAliases || {};
    } catch (err) {
      console.error(
        "[derive-guidelines] could not read registryAliases from " +
          manifestPath +
          ": " +
          err.message,
      );
      return 2;
    }
  }

  // Inputs for pattern fan-out — registry (component slugs + names + Figma
  // category names) + categories.json (members per category) + slugifier
  // (Figma category name → kebab-case slug from components/src/categories/).
  // No-op for the fan-out if any are missing; the pipeline still produces
  // the source-derived JSONs.
  const registryPath = path.join(
    d.repoRoot,
    "components",
    "dist",
    "registries",
    "dskit.json",
  );
  const categoriesPath = path.join(
    d.repoRoot,
    "components",
    "dist",
    "categories.json",
  );
  const categoriesDistDir = path.join(
    d.repoRoot,
    "components",
    "dist",
    "categories",
  );

  let registry = null;
  let categoriesData = null;
  let categorySlugFor = null;
  if (
    fs.existsSync(registryPath) &&
    fs.existsSync(categoriesPath) &&
    fs.existsSync(categoriesDistDir)
  ) {
    try {
      registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
      categoriesData = JSON.parse(fs.readFileSync(categoriesPath, "utf8"));
      // Build label → slug map from components/dist/categories/<slug>-defaults.json
      // files. Each carries `label` (Figma name) + `slug` (kebab-case).
      const labelToSlug = new Map();
      fs.readdirSync(categoriesDistDir)
        .filter((f) => /^[a-z][a-z0-9-]*-defaults\.json$/.test(f))
        .forEach((f) => {
          const def = JSON.parse(
            fs.readFileSync(path.join(categoriesDistDir, f), "utf8"),
          );
          if (def.label && def.slug) labelToSlug.set(def.label, def.slug);
        });
      categorySlugFor = (label) => labelToSlug.get(label) || "";
    } catch (err) {
      console.error(
        "[derive-guidelines] could not load fan-out inputs (registry / categories): " +
          err.message,
      );
      return 2;
    }
  }

  // Union the RENAME-INDUCED aliases the identity ledger already knows onto the
  // hand-written editorial ones (#552).
  //
  // A slug rename leaves the authored directory behind: Figma renames the
  // component to `action-bar` while its guidance stays in
  // `components/src/sticky-footer/`. Without this the nightly would have to
  // hand-write an alias entry on a PR meant to auto-merge, which is the
  // consumer-restates-the-producer shape this repo keeps paying for. The
  // editorial entries stay hand-written because "this family doc covers these
  // components" is not derivable from any ledger.
  //
  // Empty until a rename actually lands, so it changes no bytes today.
  if (registry && registry.components) {
    let ledger = null;
    try {
      const ledgerPath = path.join(
        d.repoRoot,
        "components",
        "dist",
        "identity.json",
      );
      if (fs.existsSync(ledgerPath)) {
        ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
      }
    } catch (err) {
      // A ledger that will not parse means no rename aliases, never a crash:
      // the hand-written entries must keep working on their own.
      console.error(
        "[derive-guidelines] identity ledger unreadable, deriving no rename " +
          "aliases: " +
          err.message,
      );
      ledger = null;
    }
    const derivedAliases = identityLedger.renameAliases(
      ledger,
      listComponentDirs(srcDir),
      registry.components,
    );
    Object.keys(derivedAliases).forEach((from) => {
      // A hand-written entry wins: it is a human decision about which doc
      // serves a registry key, and the ledger must not silently retarget it.
      if (!Object.prototype.hasOwnProperty.call(registryAliases, from)) {
        registryAliases[from] = derivedAliases[from];
      }
    });
  }

  let result;
  try {
    result = derivePipeline(srcDir, distDir, d.repoRoot, {
      allowEmpty: args.allowEmpty,
      registryAliases: registryAliases,
      registry: registry,
      categoriesData: categoriesData,
      categorySlugFor: categorySlugFor,
    });
  } catch (err) {
    console.error("[derive-guidelines] " + err.message);
    return 2;
  }

  if (result.synthesizedSlugs && result.synthesizedSlugs.length > 0) {
    console.log(
      "[derive-guidelines] pattern fan-out synthesized " +
        result.synthesizedSlugs.length +
        " component doc(s): " +
        result.synthesizedSlugs.sort().join(", "),
    );
  }

  if (!args.noManifest) {
    const mr = updatePathsManifest(manifestPath, result.slugs);
    // Suppress the misleading "+N -N" log on idempotent re-runs — the
    // CI derive workflow re-runs on every push, and a steady-state run
    // rotates the same keys (added === dropped). Mirrors the ce7ca2d
    // fix to derive-categories.js.
    const addedSet = new Set(mr.added);
    const unchanged =
      mr.added.length === mr.dropped.length &&
      mr.dropped.every((k) => addedSet.has(k));
    if (unchanged) {
      console.log(
        "[derive-guidelines] manifest: components.guidelineDoc section unchanged (" +
          mr.added.length +
          " entries)",
      );
    } else {
      console.log(
        "[derive-guidelines] manifest: components.guidelineDoc section +" +
          mr.added.length +
          " entries, -" +
          mr.dropped.length +
          " entries",
      );
    }
  }

  const aliasCount = Object.keys(result.aliasDocs || {}).length;
  console.log(
    "[derive-guidelines] wrote " +
      result.written.length +
      " files (" +
      result.slugs.length +
      " components" +
      (aliasCount > 0 ? " + " + aliasCount + " registry aliases" : "") +
      "): " +
      (result.slugs.join(", ") || "(none)"),
  );
  if (result.pruned.length > 0) {
    console.log(
      "[derive-guidelines] pruned " +
        result.pruned.length +
        " stale dist files: " +
        result.pruned.join(", "),
    );
  }
  return 0;
}

if (require.main === module) {
  process.exit(runCli(process.argv));
}

module.exports = {
  SCHEMA_VERSION,
  PROSE_DOMAINS,
  ALL_DOMAINS,
  makeValidators,
  parseYaml,
  deriveProseDomain,
  deriveTokensDomain,
  deriveGitMtime,
  deriveComponentDir,
  buildBundle,
  buildCoverage,
  tokenRenderGradeStats,
  buildAliasDoc,
  resolveRegistryAliases,
  listComponentDirs,
  derivePipeline,
  updatePathsManifest,
  runCli,
  parseArgs,
};
