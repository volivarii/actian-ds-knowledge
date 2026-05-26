"use strict";

// Derive transformer for components/src/categories/<slug>.md → JSON dist.
//
// PR δ (Phase 2 v2, v0.4.5+).
//
// Per Pattern H philosophy, this is a single-pass projection:
//
//   1. Parse YAML frontmatter (categories-parser.js)
//   2. Validate frontmatter against schemas/category-defaults.json (Ajv)
//   3. Project frontmatter shape to dist JSON shape (domain-anchored keys)
//   4. Emit components/dist/categories/<slug>-defaults.json (per-category)
//   5. Emit components/dist/categories/categories.bundle.json (roll-up)
//   6. Copy MD source to components/dist/categories/<slug>.md (Stripe pattern)
//   7. Auto-regenerate paths-manifest.json entries (components.categoryDefaults
//      collection + components.categoriesSrc collection + per-slug dist refs)
//
// Slug-ref resolution (motion + a11y) is INTENTIONALLY deferred to plugin
// read-time (PR ε). The dist JSON carries refs only; the plugin's loader
// resolves them against vendored interaction-motion.json + a11y-index.json.

const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
const parser = require("./categories-parser");
const { writeManifest } = require("../lib/manifest-io");

const SCHEMA_VERSION = 1;
const SCHEMA_NAME = "category-defaults.json";

// ───────────────────────────────────────────────────────────────────────────
// Schema + validator
// ───────────────────────────────────────────────────────────────────────────

function loadSchema(repoRoot) {
  const schemaPath = path.join(repoRoot, "schemas", SCHEMA_NAME);
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function makeValidator(repoRoot) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(loadSchema(repoRoot));
}

// ───────────────────────────────────────────────────────────────────────────
// Projection: frontmatter shape → dist JSON shape
// ───────────────────────────────────────────────────────────────────────────

function metaBlock(sourceRel) {
  return {
    auto_generated: true,
    source: sourceRel,
    do_not_edit: "Edit the MD source; CI regenerates this file.",
  };
}

function projectToDist(frontmatter, sourceRel) {
  // Pass-through top-level identity fields, then projected domain-anchored keys.
  // Keys use domain names (anatomy/variants/motion/accessibility) per
  // GOVERNANCE.md P1 — substrate stays renderer-agnostic. The plugin
  // (Anti-Corruption Layer per P2) is responsible for mapping these to its
  // own internal naming if it differs.
  // Note: _generatedAt intentionally omitted — emitting a fresh timestamp
  // every run breaks idempotency (every CI run produces new dist files
  // → workflow auto-commits → triggers next CI → loop). Mirrors foundations-derive,
  // which also omits timestamp fields from per-leaf JSONs.
  return {
    _meta: metaBlock(sourceRel),
    _schema_version: frontmatter._schema_version,
    slug: frontmatter.slug,
    label: frontmatter.label,
    authoring_status: frontmatter.authoring_status,
    confidence: frontmatter.confidence,
    last_reviewed: frontmatter.last_reviewed,
    anatomy: { parts: frontmatter.anatomy },
    variants: { variantAxes: frontmatter.variants },
    motion: { patternRefs: frontmatter.motion_refs },
    accessibility: { requirementRefs: frontmatter.accessibility },
    _sourceFile: sourceRel,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Derive one MD file
// ───────────────────────────────────────────────────────────────────────────

function deriveCategoryFile(mdSource, sourceRel, opts) {
  opts = opts || {};
  const validator = opts.validator;

  const parsed = parser.parse(mdSource);
  const fm = parsed.data;

  if (validator) {
    const ok = validator(fm);
    if (!ok) {
      const errs = (validator.errors || [])
        .map((e) => (e.instancePath || "(root)") + " " + e.message)
        .join("; ");
      throw new Error(
        "[derive-categories] " +
          sourceRel +
          " failed schema validation: " +
          errs,
      );
    }
  }

  const dist = projectToDist(fm, sourceRel);
  return { frontmatter: fm, body: parsed.body, dist };
}

// ───────────────────────────────────────────────────────────────────────────
// Filesystem write
// ───────────────────────────────────────────────────────────────────────────

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

function writeAtomic(absPath, contents) {
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, contents);
}

// Cleanup: remove dist files for slugs that no longer exist in srcDir.
// Mirrors foundations-derive's prune step so a renamed/removed source MD
// doesn't leave orphan <slug>-defaults.json + <slug>.md in dist.
function cleanupStaleDistFiles(distDir, expectedFiles) {
  if (!fs.existsSync(distDir)) return [];
  const existing = fs.readdirSync(distDir);
  const pruned = [];
  existing.forEach(function (file) {
    if (expectedFiles.indexOf(file) === -1) {
      const filePath = path.join(distDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        fs.unlinkSync(filePath);
        pruned.push(file);
      }
    }
  });
  return pruned;
}

// ───────────────────────────────────────────────────────────────────────────
// Bundle
// ───────────────────────────────────────────────────────────────────────────

function buildBundle(perCategory) {
  // Note: _generatedAt intentionally omitted — see projectToDist comment.
  // Idempotency requires stable byte-identical output across runs.
  const bundle = {
    _schema_version: SCHEMA_VERSION,
    _meta: {
      auto_generated: true,
      source: "components/src/categories/*.md",
      do_not_edit: "Edit the MD sources; CI regenerates this bundle.",
    },
    categories: {},
  };
  // perCategory is a map of slug → dist JSON
  Object.keys(perCategory)
    .sort()
    .forEach((slug) => {
      bundle.categories[slug] = perCategory[slug];
    });
  return bundle;
}

// ───────────────────────────────────────────────────────────────────────────
// paths-manifest.json auto-regeneration
// ───────────────────────────────────────────────────────────────────────────

const MANIFEST_CATEGORIES_NOTE =
  "components.categoryDefaults.* entries are auto-regenerated by scripts/categories/derive-categories.js. Do not hand-edit. Per-category dist JSONs + a single bundle + collection entries.";

function updatePathsManifest(manifestPath, slugs, opts) {
  opts = opts || {};
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.paths) manifest.paths = {};
  if (!manifest.collections) manifest.collections = {};

  // 1. Drop existing auto-generated components.categoryDefaults.* entries
  const dropped = [];
  Object.keys(manifest.paths).forEach((k) => {
    if (k.indexOf("components.categoryDefaults.") === 0) {
      dropped.push(k);
      delete manifest.paths[k];
    }
  });

  const added = [];

  // 2. components.categoryDefaults.bundle — single roll-up
  manifest.paths["components.categoryDefaults.bundle"] = {
    path: "components/dist/categories/categories.bundle.json",
    type: "json",
    origin: "ci",
    generator: "scripts/categories/derive-categories.js",
    description:
      "Roll-up of all 6 category-defaults JSONs keyed by slug. One-shot LLM consumption for category-aware brief enrichment.",
  };
  added.push("components.categoryDefaults.bundle");

  // 3. Per-slug dist entries
  slugs.sort().forEach((slug) => {
    const key = "components.categoryDefaults." + slug;
    manifest.paths[key] = {
      path: "components/dist/categories/" + slug + "-defaults.json",
      type: "json",
      origin: "ci",
      generator: "scripts/categories/derive-categories.js",
      description:
        "Per-category structural defaults (anatomy, variants, motion refs, a11y refs) for the '" +
        slug +
        "' category. Consumed by the component-brief skill for stub components.",
    };
    added.push(key);
  });

  // 4. Collections — categoryDefaults (dist) + categoriesSrc (src MDs)
  // Drop the legacy bare key if it survives from a pre-v0.5.1 manifest;
  // the leaf-XOR-namespace convention requires the .byKey suffix here
  // because per-slug leaves live under the same prefix.
  if (manifest.collections["components.categoryDefaults"]) {
    delete manifest.collections["components.categoryDefaults"];
  }
  manifest.collections["components.categoryDefaults.byKey"] = {
    dir: "components/dist/categories",
    pattern: "{slug}-defaults.json",
    type: "json",
    origin: "ci",
    description:
      "Per-category defaults (Phase 2 v2). 6 categories: action, form-input-selection, navigation, data-display, feedback, overlays. See also bundle entry components.categoryDefaults.bundle for the roll-up. Renamed from components.categoryDefaults in v0.5.1 to honor leaf-XOR-namespace manifest convention.",
  };
  manifest.collections["components.categoriesSrc"] = {
    dir: "components/src/categories",
    pattern: "{slug}.md",
    type: "markdown",
    origin: "human",
    description:
      "Authoring surface for category defaults. YAML frontmatter governed by schemas/category-defaults.json; freeform body for design rationale. See AUTHORING.md.",
  };

  // 5. Marker note
  manifest._notes = manifest._notes || {};
  manifest._notes.categories_auto = MANIFEST_CATEGORIES_NOTE;

  if (!opts.dryRun) {
    writeManifest(manifestPath, manifest);
  }
  return { added, dropped, manifest };
}

// ───────────────────────────────────────────────────────────────────────────
// Pipeline orchestration
// ───────────────────────────────────────────────────────────────────────────

function derivePipeline(srcDir, distDir, repoRoot, opts) {
  opts = opts || {};
  const validator = opts.validator || makeValidator(repoRoot);

  if (!fs.existsSync(srcDir)) {
    throw new Error("Source directory does not exist: " + srcDir);
  }
  const mdFiles = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".md") && f !== "AUTHORING.md")
    .sort();

  if (mdFiles.length === 0) {
    throw new Error(
      "No category MD files found in " + srcDir + ". Expected <slug>.md files.",
    );
  }

  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  const perCategory = {};
  const written = [];
  const slugs = [];

  mdFiles.forEach((mdFile) => {
    const abs = path.join(srcDir, mdFile);
    const mdSource = fs.readFileSync(abs, "utf8");
    const sourceRel = path.relative(repoRoot, abs).split(path.sep).join("/");

    let derived;
    try {
      derived = deriveCategoryFile(mdSource, sourceRel, {
        validator,
      });
    } catch (err) {
      throw new Error("Failed to derive " + sourceRel + ": " + err.message);
    }

    const slug = derived.frontmatter.slug;
    const expectedSlug = mdFile.replace(/\.md$/, "");
    if (slug !== expectedSlug) {
      throw new Error(
        sourceRel +
          ": frontmatter slug '" +
          slug +
          "' does not match filename '" +
          expectedSlug +
          "'.",
      );
    }
    slugs.push(slug);
    perCategory[slug] = derived.dist;

    // Write per-category dist JSON
    const distJsonPath = path.join(distDir, slug + "-defaults.json");
    writeAtomic(distJsonPath, stableStringify(derived.dist));
    written.push(
      path.relative(repoRoot, distJsonPath).split(path.sep).join("/"),
    );

    // Copy source MD verbatim (Stripe .md URL pattern)
    const distMdPath = path.join(distDir, slug + ".md");
    writeAtomic(distMdPath, mdSource);
    written.push(path.relative(repoRoot, distMdPath).split(path.sep).join("/"));
  });

  // Write bundle
  const bundle = buildBundle(perCategory);
  const bundlePath = path.join(distDir, "categories.bundle.json");
  writeAtomic(bundlePath, stableStringify(bundle));
  written.push(path.relative(repoRoot, bundlePath).split(path.sep).join("/"));

  // Cleanup: prune any dist files NOT in the expected output set.
  // Expected = <slug>-defaults.json + <slug>.md per slug + categories.bundle.json.
  // Without this, renamed/removed source MDs leave orphan dist files behind.
  const expectedFiles = ["categories.bundle.json"];
  slugs.forEach(function (slug) {
    expectedFiles.push(slug + "-defaults.json");
    expectedFiles.push(slug + ".md");
  });
  const pruned = cleanupStaleDistFiles(distDir, expectedFiles);

  return { perCategory, bundle, written, slugs, pruned };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI entry
// ───────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--src") args.src = argv[++i];
    else if (a === "--dist") args.dist = argv[++i];
    else if (a === "--manifest") args.manifest = argv[++i];
    else if (a === "--no-manifest") args.noManifest = true;
    else if (a === "--check") args.check = true;
  }
  return args;
}

function defaultPaths() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  return {
    src: path.join(repoRoot, "components", "src", "categories"),
    dist: path.join(repoRoot, "components", "dist", "categories"),
    manifest: path.join(repoRoot, "paths-manifest.json"),
    repoRoot,
  };
}

function runCli(argv) {
  const args = parseArgs(argv);
  const defaults = defaultPaths();
  const srcDir = args.src || defaults.src;
  const distDir = args.dist || defaults.dist;
  const manifestPath = args.manifest || defaults.manifest;

  let result;
  try {
    result = derivePipeline(srcDir, distDir, defaults.repoRoot);
  } catch (err) {
    console.error("[derive-categories] " + err.message);
    return 2;
  }

  if (!args.noManifest) {
    const mr = updatePathsManifest(manifestPath, result.slugs);
    const addedSet = new Set(mr.added);
    const unchanged =
      mr.added.length === mr.dropped.length &&
      mr.dropped.every((k) => addedSet.has(k));
    if (unchanged) {
      console.log(
        "[derive-categories] manifest: components.categoryDefaults section unchanged (" +
          mr.added.length +
          " entries)",
      );
    } else {
      console.log(
        "[derive-categories] manifest: components.categoryDefaults section +" +
          mr.added.length +
          " entries, -" +
          mr.dropped.length +
          " entries",
      );
    }
  }

  console.log(
    "[derive-categories] wrote " +
      result.written.length +
      " files (" +
      result.slugs.length +
      " categories): " +
      result.slugs.join(", "),
  );
  if (result.pruned && result.pruned.length > 0) {
    console.log(
      "[derive-categories] pruned " +
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
  deriveCategoryFile,
  derivePipeline,
  projectToDist,
  buildBundle,
  updatePathsManifest,
  makeValidator,
  loadSchema,
  runCli,
  parseArgs,
  SCHEMA_VERSION,
};
