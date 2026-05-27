"use strict";

// Tests for the hierarchical foundations derive pipeline (PR α.5 v2, v0.4.1+).
//
// Pattern H: folder hierarchy mirrors MD source. Each leaf = its own JSON,
// each branch = directory with `_index.json`. A single roll-up bundle
// gives one-shot tree access. `foundations.md` is copied verbatim.
//
// These tests pin the spec: structure mirrors MD, restructure tolerance,
// idempotency, bundle consistency, motion preservation, paths-manifest
// auto-gen, schema validation, author-friendly errors.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures", "foundations");
const DIST = path.join(REPO_ROOT, "foundations", "dist");
const SRC_DIR = path.join(REPO_ROOT, "foundations", "src");

const derive = require(
  path.join(REPO_ROOT, "scripts", "foundations", "derive-foundations.js"),
);

// Read the live foundations source by concatenating the per-section src/
// files (matches what the derive does). Replaces direct reads of the
// legacy single foundations.md file (retired in the per-section split).
function readLiveFoundationsMd() {
  return derive.concatFoundationsSources(SRC_DIR);
}
const astWalk = require(
  path.join(
    REPO_ROOT,
    "scripts",
    "foundations",
    "foundations-parser",
    "ast-walk.js",
  ),
);

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

function collectWarnings(md, opts) {
  const warnings = [];
  const logger = {
    warn: function (m) {
      warnings.push(m);
    },
  };
  const r = derive.deriveFromMarkdown(
    md,
    Object.assign({ logger }, opts || {}),
  );
  return { result: r, warnings };
}

// ───────────────────────────────────────────────────────────────────────────
// Test 1 — dist filesystem mirrors the section tree of live foundations.md
// ───────────────────────────────────────────────────────────────────────────
//
// Content-agnostic round-trip property test: for whatever foundations.md is
// currently in this repo, the derive pipeline produces a filesystem layout
// (under foundations/dist/) that matches the section tree of the source MD.
//
// Each in-memory emission is checked against the on-disk dist tree. Authors
// can rename / renumber / remove sections in foundations.md and this test
// will still pass as long as derive has been re-run.

test("dist filesystem mirrors the section tree of foundations.md", () => {
  const md = readLiveFoundationsMd();
  const { result, warnings } = collectWarnings(md);

  // Invariant A: every emitted in-memory path exists on disk under dist/.
  const expected = Object.keys(result.files);
  assert.ok(expected.length > 0, "derive must emit at least one file");
  expected.forEach((rel) => {
    const abs = path.join(DIST, rel);
    assert.ok(fs.existsSync(abs), "expected dist file missing on disk: " + rel);
  });

  // Invariant B: top-level dist directories + top-level _index siblings on
  // disk equal the slugs of the section tree's H2 nodes (minus
  // SKIP_H2_SLUGS, already filtered by buildSectionTree).
  const treeTopSlugs = result.tree.map((n) => n.slug).sort();
  assert.ok(treeTopSlugs.length > 0, "tree must have at least one H2 section");
  // For each H2 slug we should see either <slug>/_index.json or <slug>.json
  // on disk (branch vs leaf).
  treeTopSlugs.forEach((slug) => {
    const branchIndex = path.join(DIST, slug, "_index.json");
    const leafFile = path.join(DIST, slug + ".json");
    assert.ok(
      fs.existsSync(branchIndex) || fs.existsSync(leafFile),
      "H2 slug '" + slug + "' has no corresponding dist file",
    );
  });

  // Invariant C: every directory under dist/ has an _index.json (branch
  // invariant). Pure-leaf siblings live as <slug>.json files.
  function walkDirs(dir, baseDir, acc) {
    acc = acc || [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach((e) => {
      if (!e.isDirectory()) return;
      const full = path.join(dir, e.name);
      acc.push(full);
      walkDirs(full, baseDir, acc);
    });
    return acc;
  }
  const allDirs = walkDirs(DIST, DIST);
  allDirs.forEach((d) => {
    assert.ok(
      fs.existsSync(path.join(d, "_index.json")),
      "branch directory missing _index.json: " + path.relative(DIST, d),
    );
  });

  // Invariant D: no unrecognized-status warnings on live MD.
  const unknownEmojiWarns = warnings.filter(function (w) {
    return /unrecognized status cell/.test(w);
  });
  assert.equal(
    unknownEmojiWarns.length,
    0,
    "live MD has no unrecognized status emoji — got: " +
      unknownEmojiWarns.join(" | "),
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 2 — restructure tolerance (Kristina's PR #27 shape)
// ───────────────────────────────────────────────────────────────────────────

test("derive tolerates renumber + rename + section reorder", () => {
  const md = readFixture("kristina-restructure.md");
  const { result, warnings } = collectWarnings(md);
  const files = Object.keys(result.files);

  // Motion renumbered from 2.9 → 2.11. Slug stays "motion" because the
  // section number prefix is stripped before slugification.
  assert.ok(
    files.includes("tokens/motion.json"),
    "tokens/motion.json present after renumber",
  );
  const motionLeaf = result.files["tokens/motion.json"];
  assert.equal(
    motionLeaf.kind,
    "motion",
    "motion preserved as structured leaf",
  );
  assert.ok(motionLeaf.tokens, "motion has tokens object");
  assert.ok(motionLeaf.patterns, "motion has patterns object");

  // "Border Tokens" → "Borders". File should live at tokens/borders.json.
  assert.ok(
    files.includes("tokens/borders.json"),
    "tokens/borders.json present after rename",
  );

  // "Global Color" (renamed from "Color — Global Tokens") → global-color.json
  assert.ok(
    files.includes("tokens/global-color.json"),
    "tokens/global-color.json present (renamed)",
  );

  // SKIP_H2_SLUGS still applies — handoff-protocol + related-guidelines dropped.
  assert.ok(
    !files.some((p) => p.startsWith("handoff-protocol/")),
    "handoff-protocol skipped",
  );
  assert.ok(
    !files.some((p) => p.startsWith("related-guidelines/")),
    "related-guidelines skipped",
  );

  // Well-formed restructure should be clean (besides benign motion dups).
  const realWarnings = warnings.filter(
    (w) => !/duplicate pattern slug/.test(w),
  );
  assert.equal(
    realWarnings.length,
    0,
    "well-formed restructure should be clean; got: " + realWarnings.join(" | "),
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 3 — section removal removes corresponding files
// ───────────────────────────────────────────────────────────────────────────

test("removing a section from MD removes its dist files", () => {
  const md = readFixture("section-removed.md");
  const { result } = collectWarnings(md);
  const files = Object.keys(result.files);

  // section-removed.md fixture has only Primitives, Spacing, Typography
  // under H2 Tokens. Motion absent → no tokens/motion.json.
  assert.ok(
    !files.includes("tokens/motion.json"),
    "tokens/motion.json absent when no Motion section",
  );
  assert.ok(
    !files.includes("tokens/color-text-tokens.json"),
    "removed section absent from output",
  );

  // Sections that ARE present should still emit.
  assert.ok(
    files.some((p) => /\/primitives(\.json|\/_index\.json)$/.test(p)) ||
      files.some((p) => p.endsWith("/primitives.json")) ||
      files.includes("color-primitives-themes/primitives.json"),
    "primitives present somewhere in tree",
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 4 — malformed table surfaces author-friendly warning
// ───────────────────────────────────────────────────────────────────────────

test("malformed table surfaces author-friendly warning", () => {
  const md = readFixture("malformed-table.md");
  const { warnings } = collectWarnings(md);
  assert.ok(warnings.length >= 1, "got at least one warning");
  const tableWarn = warnings.find((w) =>
    /missing the `\|---\|` header separator/.test(w),
  );
  assert.ok(
    tableWarn,
    "warning mentions separator row; got: " + warnings.join(" | "),
  );
  assert.ok(
    !/at Object\.|TypeError|ReferenceError/.test(tableWarn),
    "warning should not contain a stack trace",
  );
  assert.ok(
    /Add a separator row|`---`|--- \| ---/.test(tableWarn),
    "warning should suggest a fix",
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 5 — full status emoji vocabulary recognized
// ───────────────────────────────────────────────────────────────────────────

test("all three status emojis (🟢/🔵/🟡) are recognized", () => {
  const md = readFixture("all-status-emoji.md");
  const { result, warnings } = collectWarnings(md);

  const unknown = warnings.filter((w) => /unrecognized status cell/.test(w));
  assert.equal(
    unknown.length,
    0,
    "no unrecognized-status warnings; got: " + unknown.join(" | "),
  );

  // Find the file containing the spacing rows. In fixture, "Spacing" is an H3
  // under H2 "Tokens", so it emits at tokens/spacing.json (leaf, no children).
  const spacing = result.files["tokens/spacing.json"];
  assert.ok(spacing, "tokens/spacing.json emitted");
  const table = (spacing.blocks || []).find((b) => b.type === "table");
  assert.ok(table, "table block present");
  assert.equal(table.rows.length, 3, "3 rows present");
  const statuses = table.rows.map((r) => r.status);
  assert.deepEqual(statuses, ["shipped", "in-review", "proposed"]);
});

// ───────────────────────────────────────────────────────────────────────────
// Test 6 — bundle consistency (per-file tree === bundle's nested tree)
// ───────────────────────────────────────────────────────────────────────────

test("bundle's nested tree equals the per-file tree", () => {
  const md = readLiveFoundationsMd();
  const { result } = collectWarnings(md);
  const bundle = result.bundle;

  // For every per-file leaf, look up the same path in the bundle and
  // assert deepEqual.
  Object.entries(result.files).forEach(([relPath, fileJson]) => {
    // tokens/typography/_index.json → bundle.tokens.typography._index
    // tokens/motion.json → bundle.tokens.motion
    // tokens/border-tokens/radius.json → bundle.tokens["border-tokens"].radius
    const segs = relPath.split("/");
    let cursor = bundle;
    for (let i = 0; i < segs.length - 1; i++) {
      cursor = cursor[segs[i]];
      assert.ok(
        cursor,
        "bundle missing segment '" + segs[i] + "' for " + relPath,
      );
    }
    const last = segs[segs.length - 1];
    const lookupKey =
      last === "_index.json" ? "_index" : last.replace(/\.json$/, "");
    const inBundle = cursor[lookupKey];
    assert.deepEqual(
      inBundle,
      fileJson,
      "bundle and file diverge at " + relPath,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 7 — idempotency (running derive twice produces identical output)
// ───────────────────────────────────────────────────────────────────────────

test("derive is idempotent (same input → same output)", () => {
  const md = readFixture("kristina-restructure.md");
  const r1 = derive.deriveFromMarkdown(md, { logger: { warn() {} } });
  const r2 = derive.deriveFromMarkdown(md, { logger: { warn() {} } });
  assert.deepEqual(r1.files, r2.files, "files match across runs");
  assert.deepEqual(r1.bundle, r2.bundle, "bundle matches across runs");
  assert.deepEqual(r1.rootIndex, r2.rootIndex, "rootIndex matches across runs");
});

// ───────────────────────────────────────────────────────────────────────────
// Test 8 — paths-manifest auto-gen reflects actual dist
// ───────────────────────────────────────────────────────────────────────────

test("paths-manifest foundations.* entries reflect hierarchical layout", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "paths-manifest.json"), "utf8"),
  );

  // Mandatory entries auto-generated by derive.
  assert.ok(manifest.paths["foundations.bundle"], "foundations.bundle present");
  assert.equal(
    manifest.paths["foundations.bundle"].path,
    "foundations/dist/foundations.bundle.json",
  );
  assert.ok(manifest.paths["foundations.index"], "foundations.index present");
  assert.equal(
    manifest.paths["foundations.index"].path,
    "foundations/dist/_index.json",
  );
  assert.ok(manifest.paths["foundations.source"], "foundations.source present");
  assert.equal(
    manifest.paths["foundations.source"].path,
    "foundations/dist/foundations.md",
  );

  // Per top-level H2 entry — derive the expected slugs from the source MD
  // at test time so this stays content-agnostic. Authors can rename / reorder
  // H2 sections and this test will still pass against a fresh derive.
  const md = readLiveFoundationsMd();
  const { result } = collectWarnings(md);
  const expectedTopSlugs = result.tree.map((n) => n.slug);
  assert.ok(
    expectedTopSlugs.length > 0,
    "section tree must have at least one H2 section",
  );
  expectedTopSlugs.forEach((slug) => {
    const key = "foundations." + slug;
    // A slug may be promoted to a namespace (leaf-XOR-namespace convention), in
    // which case its canonical index entry lives at <key>.index instead.
    const resolvedKey = manifest.paths[key]
      ? key
      : manifest.paths[key + ".index"]
        ? key + ".index"
        : key;
    assert.ok(manifest.paths[resolvedKey], "manifest has " + resolvedKey);
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, manifest.paths[resolvedKey].path)),
      "manifest path resolves: " + manifest.paths[resolvedKey].path,
    );
  });

  // Marker note preserved.
  assert.ok(
    manifest._notes && manifest._notes.foundations_auto,
    "manifest carries the auto-generated marker note",
  );

  // Preserved keys (human-maintained) still present.
  assert.ok(
    manifest.collections["foundations.guide"],
    "foundations.guide (src dir collection) present",
  );
  assert.ok(
    manifest.paths["foundations.authoring"],
    "foundations.authoring preserved",
  );

  // Collection entry for per-leaf tree.
  assert.ok(
    manifest.collections["foundations.leaf"],
    "foundations.leaf collection present",
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 9 — every emitted JSON validates against schema invariants
// ───────────────────────────────────────────────────────────────────────────

test("every emitted JSON has required schema fields", () => {
  const md = readLiveFoundationsMd();
  const { result } = collectWarnings(md);

  function validate(obj, relPath) {
    assert.equal(obj._schema_version, 1, relPath + " missing _schema_version");
    assert.ok(obj._meta, relPath + " missing _meta");
    assert.equal(obj._meta.auto_generated, true);
    assert.ok(obj._meta.source, relPath + " missing _meta.source");
    assert.ok(obj._meta.do_not_edit, relPath + " missing _meta.do_not_edit");
    assert.ok(typeof obj.id === "string", relPath + " missing id");
    assert.ok(typeof obj.title === "string", relPath + " missing title");
    assert.ok(Array.isArray(obj.path), relPath + " missing path");
    // parent: "" (root) or "<some/id>" or null (root index only)
    assert.ok(
      obj.parent === null || typeof obj.parent === "string",
      relPath + " parent must be string-or-null",
    );
    // anchors map present
    assert.ok(
      obj.anchors && typeof obj.anchors === "object",
      relPath + " missing anchors",
    );
  }

  Object.entries(result.files).forEach(([relPath, json]) =>
    validate(json, relPath),
  );
  validate(result.rootIndex, "_index.json (root)");
});

// ───────────────────────────────────────────────────────────────────────────
// Test 10 — motion patterns + canonical slugs preserved (PR α regression)
// ───────────────────────────────────────────────────────────────────────────

test("motion patterns survive hierarchical restructure", () => {
  const md = readLiveFoundationsMd();
  const { result } = collectWarnings(md);
  const motion = result.files["tokens/motion.json"];
  assert.ok(motion, "tokens/motion.json emitted");
  assert.ok(motion.patterns, "motion has patterns");

  const patternsList = Array.isArray(motion.patterns)
    ? motion.patterns
    : Object.keys(motion.patterns).map((k) => motion.patterns[k]);
  assert.ok(patternsList.length >= 5, "motion has ≥5 patterns");
  patternsList.forEach((p) => {
    assert.ok(p.slug, "pattern '" + p.name + "' has slug");
    assert.ok(/^[a-z][a-z0-9-]*$/.test(p.slug), "slug format: " + p.slug);
  });

  // Token buckets preserved.
  assert.ok(motion.tokens.duration, "motion.tokens.duration present");
  assert.ok(motion.tokens.easing, "motion.tokens.easing present");
  assert.ok(motion.tokens.delay, "motion.tokens.delay present");
});

// ───────────────────────────────────────────────────────────────────────────
// Test 11 — foundations.md verbatim copy at dist
// ───────────────────────────────────────────────────────────────────────────

test("foundations.md at dist == concat of per-section src/ (Stripe .md URL pattern)", () => {
  const src = readLiveFoundationsMd();
  const distMd = fs.readFileSync(path.join(DIST, "foundations.md"), "utf8");
  assert.equal(distMd, src, "dist .md must equal concat(src/) byte-for-byte");
});

// ───────────────────────────────────────────────────────────────────────────
// Test 12 — slug derivation primitives unchanged from PR α.5 v1
// ───────────────────────────────────────────────────────────────────────────

test("slug derivation strips emoji, section numbers, normalizes dashes", () => {
  const cases = [
    ["## 2.11 Motion", "motion"],
    ["## 2.10 Backgrounds", "backgrounds"],
    ["## Component Specs", "component-specs"],
    ["## 🟡 Proposed Tokens", "proposed-tokens"],
    ["### 2.1 Global Color", "global-color"],
    ["### Color — Global Tokens", "color-global-tokens"],
    ["### 2.6 Elevation (Shadows)", "elevation-shadows"],
    ["### 2.11 Heights and Trigger Areas", "heights-and-trigger-areas"],
    [
      "#### Brightness Filter — Interactive States",
      "brightness-filter-interactive-states",
    ],
  ];
  for (const [raw, expected] of cases) {
    const text = raw.replace(/^#+\s+/, "");
    const cleaned = astWalk.cleanHeading(text);
    const slug = astWalk.slugify(cleaned);
    assert.equal(slug, expected, "input '" + raw + "' produced '" + slug + "'");
  }
});
