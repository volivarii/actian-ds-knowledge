"use strict";

// Hierarchical foundations derive (PR α.5 v2, v0.4.1+).
//
// Walks the AST of the concatenated foundations/src/ per-section files and
// emits a *folder
// hierarchy* mirroring the MD structure. Per Pattern H (Hybrid):
//
//   - Each leaf section (no child headings) → `<slug>.json`
//   - Each branch section (has child headings) → `<slug>/` directory with
//     `_index.json` carrying section metadata + body/blocks + child list.
//   - Root `_index.json` carries top-level metadata.
//   - `foundations.bundle.json` is a single nested roll-up (full tree) for
//     one-shot LLM consumption.
//   - `foundations.md` is the synthesized concatenation of src/*.md
//     (with `\n\n---\n\n` joiners) for Stripe-style `.md` URL access.
//     NOT byte-identical to any single source file.
//
// Authors (UX team) can renumber/rename/remove/restructure sections freely
// — the parser tracks MD structure, not section numbers.
//
// Special case: the Motion section (detected by content shape — H4 children
// named Duration/Easing/Delay) emits a SINGLE leaf JSON with the structured
// `{tokens, patterns}` shape, even though its H4 children would normally
// imply a sub-directory. This preserves the plugin's motion-pattern lookup
// API. PR ε migrates plugin paths to the new hierarchical location.
//
// `paths-manifest.json` foundations.* entries are auto-regenerated based on
// the actual dist files produced. The manifest's foundations.bundle entry
// plus foundations.{tokens,foundations,component-specs,etc.}._index point
// to the per-directory metadata files; per-leaf paths are mostly accessed
// via the bundle.

var fs = require("fs");
var path = require("path");
// Agnostic section-dist emission engine (relocated to scripts/lib/section-dist
// in Task 2 of the section-dist refactor). The parser sub-modules + the
// generic emission/Motion functions live there now; this module re-exports
// them (see module.exports at the bottom) so existing requirers keep working.
var sectionDist = require("../lib/section-dist/index.js");
var astWalk = sectionDist.astWalk;
var categoriesParser = require("../lib/frontmatter");
var { writeManifest } = require("../lib/manifest-io");
var { stableStringify, writeAtomic } = require("../lib/dist-io");
var orderManifest = require("../lib/order-manifest.js");
var ORDER_MANIFEST_NAME = orderManifest.ORDER_MANIFEST_NAME;
var META_FILES = orderManifest.META_FILES;
var readOrderManifest = orderManifest.readOrderManifest;
var readSlugFiles = orderManifest.readSlugFiles;
var assertOrderConsistency = orderManifest.assertOrderConsistency;

// Agnostic engine functions, pulled in as locals so the foundations-specific
// code below (writeOutputs / buildFoundationsIndex / updatePathsManifest /
// runCli) can call them by their bare names exactly as before. These now live
// in scripts/lib/section-dist/index.js.
var SCHEMA_VERSION = sectionDist.SCHEMA_VERSION;
var metaBlock = sectionDist.metaBlock;
var applyStatusToRows = sectionDist.applyStatusToRows;
var extractBodyAndBlocks = sectionDist.extractBodyAndBlocks;
var buildLeafJson = sectionDist.buildLeafJson;
var buildIndexJson = sectionDist.buildIndexJson;
var buildEmissionPlan = sectionDist.buildEmissionPlan;
var buildRootIndex = sectionDist.buildRootIndex;
var buildBundle = sectionDist.buildBundle;
var attachFrontmatterRefs = sectionDist.attachFrontmatterRefs;
var isMotionShape = sectionDist.isMotionShape;
var buildMotionPayload = sectionDist.buildMotionPayload;
var slugifyPatternName = sectionDist.slugifyPatternName;
var extractExplicitPatternAnchor = sectionDist.extractExplicitPatternAnchor;
var isBoldOnlyParagraph = sectionDist.isBoldOnlyParagraph;

// ───────────────────────────────────────────────────────────────────────────
// Foundations-specific config: which H2 slugs to skip entirely
// ───────────────────────────────────────────────────────────────────────────

// Sections whose H2 slug should be skipped entirely (out-of-scope content).
// This is a foundations-domain choice, not part of the agnostic engine — so it
// lives here. The engine's deriveFromMarkdown defaults to NO skipping ({}); the
// foundations wrapper below injects this map as the default.
var SKIP_H2_SLUGS = {
  "handoff-protocol": true,
  "related-guidelines": true,
};

// Foundations-flavored deriveFromMarkdown: identical to the agnostic engine
// entry, but defaults `skipH2Slugs` to the foundations SKIP_H2_SLUGS when the
// caller doesn't supply one. Preserves the historical behavior that
// requirers/tests calling `derive.deriveFromMarkdown(md, { logger })` get
// handoff-protocol/related-guidelines dropped without passing skipH2Slugs.
function deriveFromMarkdown(mdSource, opts) {
  opts = opts || {};
  if (!opts.skipH2Slugs) {
    opts = Object.assign({}, opts, { skipH2Slugs: SKIP_H2_SLUGS });
  }
  return sectionDist.deriveFromMarkdown(mdSource, opts);
}

// ───────────────────────────────────────────────────────────────────────────
// Filesystem write + prune
// ───────────────────────────────────────────────────────────────────────────

// Recursively walk a directory and return relative paths of all files
// that match `predicate(relPath)`. relPaths use forward slashes.
function walkDir(dir, baseDir, predicate, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var ent = entries[i];
    var full = path.join(dir, ent.name);
    var rel = path.relative(baseDir, full).split(path.sep).join("/");
    if (ent.isDirectory()) {
      walkDir(full, baseDir, predicate, acc);
    } else if (ent.isFile()) {
      if (!predicate || predicate(rel)) acc.push(rel);
    }
  }
  return acc;
}

// Delete a file then recursively prune empty parent directories up to
// (but not including) `stopDir`.
function deleteAndPruneEmpty(absPath, stopDir) {
  fs.unlinkSync(absPath);
  var parent = path.dirname(absPath);
  while (
    parent &&
    parent !== stopDir &&
    parent.startsWith(stopDir + path.sep)
  ) {
    try {
      var entries = fs.readdirSync(parent);
      if (entries.length > 0) break;
      fs.rmdirSync(parent);
    } catch (_e) {
      break;
    }
    parent = path.dirname(parent);
  }
}

function writeOutputs(
  distDir,
  files,
  bundle,
  rootIndex,
  mdContent,
  sourceRel,
  opts,
) {
  opts = opts || {};
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  var written = [];

  // 1. Write per-leaf + per-_index files
  Object.keys(files).forEach(function (relPath) {
    var dest = path.join(distDir, relPath);
    writeAtomic(dest, stableStringify(files[relPath]));
    written.push(relPath);
  });

  // 2. Write root _index.json + bundle + .md copy
  writeAtomic(path.join(distDir, "_index.json"), stableStringify(rootIndex));
  written.push("_index.json");
  writeAtomic(
    path.join(distDir, "foundations.bundle.json"),
    stableStringify(bundle),
  );
  written.push("foundations.bundle.json");

  // Stripe .md URL pattern — emit a SYNTHESIZED prose copy at dist. The
  // content is the concatenated per-section MD already passed in (matches
  // what the deriver saw, complete with `\n\n---\n\n` joiners). NOT byte-
  // identical to any single source file; per-section authoring is the SoT
  // under foundations/src/. Empty content is a programmer error — throw
  // rather than silently leaving a stale dist/foundations.md from a
  // previous run.
  if (typeof mdContent !== "string") {
    throw new Error(
      "writeOutputs: mdContent must be a string (got " + typeof mdContent + ")",
    );
  }
  if (mdContent.length === 0) {
    throw new Error(
      "writeOutputs: mdContent is empty — refusing to emit an empty dist/foundations.md",
    );
  }
  writeAtomic(path.join(distDir, "foundations.md"), mdContent);
  written.push("foundations.md");

  // 3. Prune stale auto-generated JSON files (idempotency).
  // Owned files: _meta.auto_generated === true. Don't touch foundations.md
  // (it's the synthesized verbatim copy — always regenerated). Don't touch
  // README.md or anything else hand-maintained.
  var removed = [];
  if (!opts.skipPrune) {
    var owned = {};
    Object.keys(files).forEach(function (rp) {
      owned[rp] = true;
    });
    owned["_index.json"] = true;
    owned["foundations.bundle.json"] = true;
    // foundations-index.json is written by runCli after writeOutputs (it's
    // derived from the _order manifest, not the section tree). Mark it owned
    // so prune doesn't delete-then-log it as stale every run.
    owned["foundations-index.json"] = true;
    var existing = walkDir(distDir, distDir, function (rp) {
      return /\.json$/.test(rp);
    });
    for (var i = 0; i < existing.length; i++) {
      var rp = existing[i];
      if (owned[rp]) continue;
      var fullPath = path.join(distDir, rp);
      try {
        var contents = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        if (
          contents &&
          contents._meta &&
          contents._meta.auto_generated === true
        ) {
          deleteAndPruneEmpty(fullPath, distDir);
          removed.push(rp);
        }
      } catch (_e) {
        // Malformed — leave for a human.
      }
    }
  }

  return { written: written, removed: removed };
}

// ───────────────────────────────────────────────────────────────────────────
// paths-manifest.json auto-generation (foundations.* entries)
// ───────────────────────────────────────────────────────────────────────────
//
// Hierarchical Pattern H emits a LOT of files. We don't want to enumerate
// every leaf JSON in the manifest (would balloon the manifest). Instead:
//
//   - One top-level `foundations.bundle` entry → foundations/dist/foundations.bundle.json
//   - One `foundations.md` (verbatim copy) entry → foundations/dist/foundations.md
//   - One `foundations.<topLevelSlug>` per H2 directory → its `_index.json`
//     or, for leaf-H2, its `.json` file.
//   - Plus the auto-generated marker note.
//
// Per-leaf paths can still be located via the bundle (one fetch gives the
// full tree). The plugin's PR ε will update its lookup paths.

var MANIFEST_FOUNDATIONS_NOTE =
  "foundations.* entries are auto-regenerated by scripts/foundations/derive-foundations.js. Do not hand-edit. Hierarchical layout: bundle for one-shot, per-H2 _index entries for navigation; full per-leaf tree lives under foundations/dist/<slug>/.";

function updatePathsManifest(manifestPath, derived, sourceRel, opts) {
  opts = opts || {};
  var manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  if (!manifest.paths) manifest.paths = {};

  // 1. Drop existing auto-generated foundations.* entries (preserve human-
  //    maintained pointers).
  //
  // foundations.md (legacy single-file pointer) was retired when the SoT
  // moved to per-section files under foundations/src/. The new authoring
  // surface lives in collections (foundations.guide), not paths.
  var preservedKeys = {
    "foundations.authoring": true,
  };
  var dropped = [];
  Object.keys(manifest.paths).forEach(function (k) {
    if (k.indexOf("foundations.") !== 0) return;
    if (preservedKeys[k]) return;
    dropped.push(k);
    delete manifest.paths[k];
  });

  var added = [];

  // 2. foundations.bundle — single roll-up
  manifest.paths["foundations.bundle"] = {
    path: "foundations/dist/foundations.bundle.json",
    type: "json",
    origin: "ci",
    generator: "scripts/foundations/derive-foundations.js",
    description:
      "Full nested foundations tree (hierarchical Pattern H roll-up). One-shot LLM consumption: every section/leaf reachable from this single file.",
  };
  added.push("foundations.bundle");

  // 3. foundations.index — root _index.json
  manifest.paths["foundations.index"] = {
    path: "foundations/dist/_index.json",
    type: "json",
    origin: "ci",
    generator: "scripts/foundations/derive-foundations.js",
    description:
      "Root foundations metadata + top-level child list. Navigate from here to per-H2 directories.",
  };
  added.push("foundations.index");

  // 4. foundations.source — verbatim MD copy at dist for Stripe .md URL pattern.
  manifest.paths["foundations.source"] = {
    path: "foundations/dist/foundations.md",
    type: "markdown",
    origin: "ci",
    generator: "scripts/foundations/derive-foundations.js",
    description:
      "Synthesized concatenation of foundations/src/ per-section files joined with `\\n\\n---\\n\\n` (Stripe .md URL pattern). Auto-synced; do not edit. The substrate-side SoT is the per-section files; this dist artifact bakes section separators that don't exist in any single source file.",
  };
  added.push("foundations.source");

  // 5. Per top-level (H2) section: point at its _index.json (branch) or
  //    leaf .json file. Key is `foundations.<topSlug>`.
  var topLevels = derived.tree.map(function (n) {
    return n;
  });
  // A motion-shape child (Duration/Easing/Delay — see isMotionShape) is
  // emitted as its own structured leaf and is consumed DIRECTLY by motion-ref
  // resolution in the plugin + docs category-defaults-loader
  // (manifest.paths["foundations.<slug>.motion"]). When a section has one,
  // surface it explicitly: the section's own key becomes
  // `foundations.<slug>.index` so `.motion` can sit beside it without breaking
  // the leaf-XOR-namespace rule (tests/manifest-convention).
  for (var i = 0; i < topLevels.length; i++) {
    var n = topLevels[i];
    var hasChildren = n.children.length > 0 && !isMotionShape(n);
    var motionChild = null;
    for (var c = 0; c < n.children.length; c++) {
      if (isMotionShape(n.children[c])) {
        motionChild = n.children[c];
        break;
      }
    }
    var p = hasChildren
      ? "foundations/dist/" + n.slug + "/_index.json"
      : "foundations/dist/" + n.slug + ".json";
    var description = hasChildren
      ? "Hierarchical _index for foundations section '" +
        n.title +
        "'. Children listed inside; sibling files under foundations/dist/" +
        n.slug +
        "/."
      : "Foundations section '" + n.title + "' (leaf-only — no sub-sections).";
    var key = motionChild
      ? "foundations." + n.slug + ".index"
      : "foundations." + n.slug;
    manifest.paths[key] = {
      path: p,
      type: "json",
      origin: "ci",
      generator: "scripts/foundations/derive-foundations.js",
      description: description,
    };
    added.push(key);
    if (motionChild) {
      var motionKey = "foundations." + n.slug + "." + motionChild.slug;
      manifest.paths[motionKey] = {
        path: "foundations/dist/" + n.slug + "/" + motionChild.slug + ".json",
        type: "json",
        origin: "ci",
        generator: "scripts/foundations/derive-foundations.js",
        description:
          "Structured motion leaf (tokens + patterns) for foundations " +
          "section '" +
          n.title +
          "'. Resolved directly by motion-ref lookup in the plugin + docs.",
      };
      added.push(motionKey);
    }
  }

  // 6. Marker note.
  manifest._notes = manifest._notes || {};
  manifest._notes.foundations_auto = MANIFEST_FOUNDATIONS_NOTE;

  // 7. Collection entry for the per-leaf tree (so consumers know the layout).
  if (!manifest.collections) manifest.collections = {};
  // resolvable:false is REQUIRED here, not decorative: validate-manifest gates
  // every collection whose pattern can address a member, and Pattern H nests
  // arbitrarily deep, so no single pattern addresses one. This entry is fully
  // regenerated on every derive, so the flag has to live in the generator; a
  // hand-edit in paths-manifest.json is silently dropped on the next run.
  manifest.collections["foundations.leaf"] = {
    dir: "foundations/dist",
    pattern: "<topSlug>/.../<slug>.json",
    recursive: true,
    resolvable: false,
    type: "json",
    origin: "ci",
    description:
      "Per-leaf foundations JSONs in hierarchical Pattern H layout. Each leaf mirrors its MD heading path. Branch nodes carry an `_index.json` instead. Single roll-up at foundations.bundle. Recursive: any file under foundations/dist/ is covered by this collection. Descriptive only (resolvable: false): the layout is arbitrarily deep, so no single pattern addresses a member. If a consumer ever needs path-addressed access, switch to pattern '{name}'.",
  };

  if (!opts.dryRun) {
    writeManifest(manifestPath, manifest);
  }
  return { added: added, dropped: dropped, manifest: manifest };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI
// ───────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  var args = {};
  for (var i = 2; i < argv.length; i++) {
    var a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--md") args.md = argv[++i];
    else if (a === "--src-dir") args.srcDir = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--manifest") args.manifest = argv[++i];
    else if (a === "--no-manifest") args.noManifest = true;
    else if (a === "--no-prune") args.noPrune = true;
    else if (a === "--map") {
      args._legacyMap = argv[++i];
    }
  }
  return args;
}

function defaultPaths() {
  var repoRoot = path.resolve(__dirname, "..", "..");
  return {
    srcDir: path.join(repoRoot, "foundations", "src"),
    out: path.join(repoRoot, "foundations", "dist"),
    manifest: path.join(repoRoot, "paths-manifest.json"),
    repoRoot: repoRoot,
  };
}

// Read all per-section MD files under srcDir (ordered by _order.json,
// AUTHORING.md and other meta files excluded), trim trailing whitespace from
// each, and concatenate with `\n\n---\n\n` separators between consecutive
// files. The result is the input fed to the MD parser AND emitted to
// dist/foundations.md for the Stripe .md URL pattern (synthesized, not
// byte-verbatim — see writeOutputs comment).
// Sort order = canonical section order: the per-directory `_order.json`
// manifest enumerates section slugs in canonical order. The manifest
// reader + drift checker live in scripts/lib/order-manifest.js (shared
// with derive-a11y-index.js); see ORDER_MANIFEST_NAME / META_FILES /
// readOrderManifest / readSlugFiles / assertOrderConsistency imported
// above.
var FENCE_RE = /^(```|~~~)/;

// Strip the leading `---\n…\n---\n` YAML frontmatter envelope from a raw src
// file and return the body. If no envelope is present, returns `raw` unchanged.
// Pure string operation: does NOT parse the YAML payload and does NOT throw.
// Used by both extractOptionalFrontmatter (which then YAML-parses the captured
// envelope) and concatFoundationsSources (which discards the envelope).
function stripFrontmatterEnvelope(raw) {
  if (!/^---\s*(\r?\n|$)/.test(raw)) return raw;
  var lines = raw.split(/\r?\n/);
  for (var i = 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i])) {
      return lines
        .slice(i + 1)
        .join("\n")
        .replace(/^\n+/, "");
    }
  }
  return raw;
}

// Strip optional YAML frontmatter from a single src file. Per-file frontmatter
// is OPTIONAL (most files don't carry it). When present, it follows the same
// strict YAML subset as components/src/categories/<slug>.md and is parsed by
// the shared lib/frontmatter parser. The frontmatter is stripped BEFORE concat so
// the markdown AST never sees stray `---` fences. Returns { frontmatter, body }
// where frontmatter is `null` if absent.
//
// Used to attach optional per-file metadata (e.g. `a11y_refs` +
// `motion_refs` ref arrays — P8 transversal taxonomy closure for foundations)
// to the file's top-level H2 in the emitted JSON.
function extractOptionalFrontmatter(name, raw) {
  if (!/^---\s*(\r?\n|$)/.test(raw)) {
    return { frontmatter: null, body: raw };
  }
  try {
    var split = categoriesParser.splitFrontmatter(raw);
    var data = categoriesParser.parseFrontmatter(
      split.frontmatter,
      split.frontmatterLineOffset,
    );
    return { frontmatter: data, body: stripFrontmatterEnvelope(raw) };
  } catch (err) {
    throw new Error(name + " frontmatter: " + err.message);
  }
}

// Find the slug of the first H2 in a body. Mirrors how the AST walker slugs
// section headings: strip leading numeric prefix + emoji, then slugify. Returns
// null when the body has no H2 heading.
function firstH2Slug(body) {
  var lines = body.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var m = /^##\s+(.+?)\s*$/.exec(lines[i]);
    if (m) return astWalk.slugify(astWalk.cleanHeading(m[1]));
  }
  return null;
}

// Read every .md file listed in `_order.json` for `srcDir` (meta files like
// AUTHORING.md, README.md, and `_order.json` itself are excluded by the
// manifest contract; drift between disk and manifest is detected before the
// read), strip optional frontmatter, and return:
//   {
//     md: <concatenated body, joined with "\n\n---\n\n">,
//     frontmattersByTopSlug: { <topH2Slug>: <frontmatterObject>, ... },
//   }
//
// Files without frontmatter contribute nothing to `frontmattersByTopSlug`.
// Files whose top H2 falls under `SKIP_H2_SLUGS` are tolerated (frontmatter
// is parsed but won't attach to any emitted node — the section is dropped
// before emission). A warning is emitted in that case so authors know their
// refs are silently no-op.
function readFoundationsSources(srcDir, logger) {
  var order = readOrderManifest(srcDir);
  var onDisk = readSlugFiles(srcDir);
  if (onDisk.size === 0) {
    throw new Error(
      "no .md files found under " + srcDir + " (excluding meta files)",
    );
  }
  assertOrderConsistency(srcDir, order, onDisk);
  var entries = order.map(function (slug) {
    return slug + ".md";
  });
  var bodies = [];
  var frontmattersByTopSlug = {};
  for (var i = 0; i < entries.length; i++) {
    var name = entries[i];
    var abs = path.join(srcDir, name);
    var raw = fs.readFileSync(abs, "utf-8");
    var extracted = extractOptionalFrontmatter(name, raw);
    assertBalancedFences(name, extracted.body);
    var trimmedBody = extracted.body.replace(/\s+$/, "");
    bodies.push(trimmedBody);
    if (extracted.frontmatter) {
      var slug = firstH2Slug(trimmedBody);
      if (!slug) {
        throw new Error(
          name +
            " has frontmatter but no H2 heading to attach it to. " +
            "Either add a top-level `## …` heading or remove the frontmatter.",
        );
      }
      if (SKIP_H2_SLUGS[slug] && logger) {
        logger.warn(
          name +
            " frontmatter attaches to H2 '" +
            slug +
            "' which is in SKIP_H2_SLUGS — refs will not appear in dist. " +
            "Remove the frontmatter or take this section out of SKIP_H2_SLUGS.",
        );
      }
      if (frontmattersByTopSlug[slug]) {
        throw new Error(
          name +
            " top H2 slug '" +
            slug +
            "' duplicates another src file's. Frontmatter attachment is ambiguous; " +
            "rename one of the headings.",
        );
      }
      frontmattersByTopSlug[slug] = extracted.frontmatter;
    }
  }
  return {
    md: bodies.join("\n\n---\n\n"),
    frontmattersByTopSlug: frontmattersByTopSlug,
  };
}

// Back-compat: callers that only want the concatenated MD (tests, llms-txt)
// get the same string they got before. Frontmatter is stripped from each file
// but NOT parsed — these callers have no use for the YAML payload and shouldn't
// pay the parse cost or fail on YAML typos that only matter to the derive
// pipeline proper (which surfaces those errors via readFoundationsSources).
function concatFoundationsSources(srcDir) {
  var order = readOrderManifest(srcDir);
  var onDisk = readSlugFiles(srcDir);
  assertOrderConsistency(srcDir, order, onDisk);
  return order
    .map(function (slug) {
      var name = slug + ".md";
      var abs = path.join(srcDir, name);
      var raw = fs.readFileSync(abs, "utf-8");
      // Strip frontmatter envelope without parsing the YAML body.
      var body = stripFrontmatterEnvelope(raw);
      assertBalancedFences(name, body);
      return body.replace(/\s+$/, "");
    })
    .join("\n\n---\n\n");
}

// Verify code fences (``` and ~~~) are balanced in a single src file. An
// unbalanced fence at the end of one file would consume the inter-file
// `---` separator + content from the next file when the concat is parsed.
function assertBalancedFences(name, src) {
  var open = 0;
  var lines = src.split("\n");
  for (var i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) open = open === 0 ? 1 : 0;
  }
  if (open !== 0) {
    throw new Error(
      name +
        " has an unbalanced code fence (\\`\\`\\` or ~~~). Fix the unterminated fence; an open fence at end-of-file would swallow inter-section separators when files are concatenated.",
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Flat foundations-index.json — transversal ref-resolution target
// ───────────────────────────────────────────────────────────────────────────

// Sections excluded from the flat referenceable index:
//  - intro (H1 document root) + table-of-contents (generated nav): structural, not design sections.
//  - everything in SKIP_H2_SLUGS: those sections are intentionally NOT emitted to dist, so
//    they have no resolvable content and must not be advertised as referenceable.
// Deriving from SKIP_H2_SLUGS keeps the referenceable set aligned with what actually has dist backing.
var INDEX_EXCLUDE_SLUGS = Object.assign(
  { intro: true, "table-of-contents": true },
  SKIP_H2_SLUGS,
);

// Build the flat { _schema_version, _meta, sections:[{slug,title}] } index from
// the _order.json manifest + each file's first H2. Slug is derived the same way
// the hierarchical tree derives it (cleanHeading is anchor-safe), so index
// slugs == tree slugs == the {#anchor} literal.
function buildFoundationsIndex(srcDir) {
  var order = readOrderManifest(srcDir);
  var sections = [];
  for (var i = 0; i < order.length; i++) {
    var slug = order[i];
    if (INDEX_EXCLUDE_SLUGS[slug]) continue;
    var abs = path.join(srcDir, slug + ".md");
    var raw = fs.readFileSync(abs, "utf-8");
    var body = stripFrontmatterEnvelope(raw);
    var lines = body.split("\n");
    var title = null;
    var derivedSlug = null;
    for (var j = 0; j < lines.length; j++) {
      var m = /^##\s+(.+?)\s*$/.exec(lines[j]);
      if (m) {
        title = astWalk.cleanHeading(m[1]);
        derivedSlug = astWalk.slugify(title);
        break;
      }
    }
    if (!derivedSlug) {
      throw new Error(
        "foundations-index: " + slug + ".md has no top-level H2 to index.",
      );
    }
    sections.push({ slug: derivedSlug, title: title });
  }
  return {
    _schema_version: 1,
    _meta: metaBlock("foundations/src/"),
    sections: sections,
  };
}

function runCli(argv) {
  var args = parseArgs(argv);
  var defaults = defaultPaths();
  var srcDir = args.srcDir || defaults.srcDir;
  var outDir = args.out || defaults.out;
  var manifestPath = args.manifest || defaults.manifest;

  if (args._legacyMap) {
    console.warn(
      "[derive-foundations] --map is deprecated (hierarchical derive uses MD structure directly); ignoring '" +
        args._legacyMap +
        "'.",
    );
  }
  if (args.md) {
    console.error(
      "[derive-foundations] --md was retired in the per-section split. Authoring lives under a directory of files now. Pass --src-dir <dir> instead (got --md '" +
        args.md +
        "').",
    );
    return 2;
  }

  if (!fs.existsSync(srcDir)) {
    console.error(
      "[derive-foundations] source directory not found: " +
        srcDir +
        "\nCheck the path — is it really foundations/src/?",
    );
    return 2;
  }

  var logger = {
    warn: function (m) {
      console.warn("[derive-foundations] " + m);
    },
  };

  var srcRead;
  try {
    srcRead = readFoundationsSources(srcDir, logger);
  } catch (err) {
    console.error("[derive-foundations] " + err.message);
    return 2;
  }
  var md = srcRead.md;

  var sourceRel =
    path
      .relative(defaults.repoRoot, srcDir)
      .replace(/\\/g, "/")
      .replace(/\/$/, "") + "/";

  var derived;
  try {
    derived = deriveFromMarkdown(md, {
      logger: logger,
      sourceRel: sourceRel,
      frontmattersByTopSlug: srcRead.frontmattersByTopSlug,
    });
  } catch (err) {
    console.error("[derive-foundations] failed to parse MD: " + err.message);
    console.error(
      "  Hint: check for malformed tables (missing column header, missing pipe), unclosed code fences, or H2/H3 nesting issues near the line in question.",
    );
    return 3;
  }

  if (args.check) {
    var drifts = [];
    Object.keys(derived.files).forEach(function (rp) {
      var expected = stableStringify(derived.files[rp]);
      var dest = path.join(outDir, rp);
      var actual = fs.existsSync(dest) ? fs.readFileSync(dest, "utf-8") : "";
      if (actual !== expected) drifts.push(rp);
    });
    var rootExpected = stableStringify(derived.rootIndex);
    var rootDest = path.join(outDir, "_index.json");
    var rootActual = fs.existsSync(rootDest)
      ? fs.readFileSync(rootDest, "utf-8")
      : "";
    if (rootActual !== rootExpected) drifts.push("_index.json");
    var bundleExpected = stableStringify(derived.bundle);
    var bundleDest = path.join(outDir, "foundations.bundle.json");
    var bundleActual = fs.existsSync(bundleDest)
      ? fs.readFileSync(bundleDest, "utf-8")
      : "";
    if (bundleActual !== bundleExpected) drifts.push("foundations.bundle.json");
    var indexExpected = stableStringify(buildFoundationsIndex(srcDir));
    var indexDest = path.join(outDir, "foundations-index.json");
    var indexActual = fs.existsSync(indexDest)
      ? fs.readFileSync(indexDest, "utf-8")
      : "";
    if (indexActual !== indexExpected) drifts.push("foundations-index.json");
    if (drifts.length === 0) {
      console.log("[derive-foundations] no drift");
      return 0;
    }
    console.error(
      "[derive-foundations] drift detected in: " + drifts.join(", "),
    );
    console.error("Run `npm run derive:foundations` to regenerate.");
    return 1;
  }

  var wr = writeOutputs(
    outDir,
    derived.files,
    derived.bundle,
    derived.rootIndex,
    md,
    sourceRel,
    { skipPrune: args.noPrune },
  );

  var fIndex = buildFoundationsIndex(srcDir);
  writeAtomic(
    path.join(outDir, "foundations-index.json"),
    stableStringify(fIndex),
  );

  if (!args.noManifest) {
    var manifestResult = updatePathsManifest(manifestPath, derived, sourceRel);
    console.log(
      "[derive-foundations] manifest: +" +
        manifestResult.added.length +
        " entries, -" +
        manifestResult.dropped.length +
        " entries",
    );
  }

  console.log(
    "[derive-foundations] wrote " +
      wr.written.length +
      " files to " +
      outDir +
      (wr.removed.length ? " (pruned " + wr.removed.length + " stale)" : ""),
  );
  if (wr.removed.length) {
    console.log("[derive-foundations] pruned: " + wr.removed.join(", "));
  }
  return 0;
}

if (require.main === module) {
  process.exit(runCli(process.argv));
}

module.exports = {
  deriveFromMarkdown,
  concatFoundationsSources,
  readFoundationsSources,
  attachFrontmatterRefs,
  buildLeafJson,
  buildIndexJson,
  buildRootIndex,
  buildBundle,
  buildEmissionPlan,
  buildFoundationsIndex,
  buildMotionPayload,
  isMotionShape,
  slugifyPatternName,
  extractExplicitPatternAnchor,
  isBoldOnlyParagraph,
  applyStatusToRows,
  extractBodyAndBlocks,
  writeOutputs,
  updatePathsManifest,
  runCli,
  parseArgs,
  SKIP_H2_SLUGS: SKIP_H2_SLUGS,
  SCHEMA_VERSION: SCHEMA_VERSION,
};
