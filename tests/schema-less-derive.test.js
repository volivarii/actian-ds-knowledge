"use strict";

// Tests for the schema-less foundations derive pipeline (PR α.5, v0.4.1+).
//
// Design constraint: the MD structure determines the output structure.
// Authors can renumber/rename/remove sections; the derive script adapts.
// These tests pin that behavior so future regressions get caught.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures", "foundations");

const derive = require(
  path.join(REPO_ROOT, "scripts", "foundations", "derive-foundations.js"),
);
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
// Test 1 — schema-less smoke on current foundations.md
// ───────────────────────────────────────────────────────────────────────────

test("derive produces a reasonable file set from the live foundations.md", () => {
  const md = fs.readFileSync(
    path.join(REPO_ROOT, "foundations", "src", "foundations.md"),
    "utf8",
  );
  const { result, warnings } = collectWarnings(md);
  const files = Object.keys(result.output);

  // Expectation set: live MD has 4 H2 sections in scope (1, 2, 3, 4) plus
  // skipped ones (5 Handoff, 6 Related). Per leaf-H3 rule that's ~20+ files.
  // Lower bound enforces "non-trivial output"; upper bound catches runaway
  // emission (e.g., we accidentally start emitting per-H4).
  assert.ok(
    files.length >= 15 && files.length <= 40,
    "expected 15-40 files, got " + files.length,
  );

  // Motion (special case) must be present.
  assert.ok(result.output["motion.json"], "motion.json present");
  const motion = result.output["motion.json"];
  assert.ok(motion.patterns, "motion has patterns");
  assert.ok(
    Object.keys(motion.patterns).length >= 5,
    "motion has multiple patterns",
  );

  // No unrecognized-status-emoji warnings on the live MD (vocabulary covers all).
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
  const files = new Set(Object.keys(result.output));

  // Renumbered: Motion moved from "2.9" → "2.11". File should still be motion.json.
  assert.ok(files.has("motion.json"), "motion.json present after renumber");
  assert.ok(
    result.output["motion.json"].patterns,
    "motion still produces structured patterns after renumber",
  );

  // Renamed: "Border Tokens" → "Borders". File should be borders.json.
  assert.ok(files.has("borders.json"), "borders.json present after rename");

  // Renamed: "Global Color" → still maps to global-color.json (heading slug).
  assert.ok(files.has("global-color.json"), "global-color.json present");

  // SKIP_H2_SLUGS still applies (handoff-protocol + related-guidelines dropped).
  assert.ok(
    !files.has("before-you-hand-off.json"),
    "handoff sections skipped",
  );
  assert.ok(
    !files.has("accessibility-guidelines.json"),
    "related guidelines skipped",
  );

  // No spurious warnings on a well-formed restructure.
  const realWarnings = warnings.filter(function (w) {
    return !/duplicate pattern slug/.test(w); // skip benign motion warnings
  });
  assert.equal(
    realWarnings.length,
    0,
    "well-formed restructure should be clean; got: " + realWarnings.join(" | "),
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 3 — removal of a section removes the corresponding dist file
// ───────────────────────────────────────────────────────────────────────────

test("removing a section from MD removes its dist file", () => {
  const md = readFixture("section-removed.md");
  const { result } = collectWarnings(md);
  const files = new Set(Object.keys(result.output));

  // section-removed.md has only Primitives, Spacing, Typography under section 2.
  // Importantly: motion.json should NOT appear (no Motion section in fixture).
  assert.ok(!files.has("motion.json"), "motion.json absent when no Motion section");
  assert.ok(
    !files.has("color-text-tokens.json"),
    "removed section absent from output",
  );

  // The sections that ARE present should still emit.
  assert.ok(files.has("primitives.json"), "primitives.json present");
  assert.ok(files.has("spacing.json"), "spacing.json present");
  assert.ok(files.has("typography.json"), "typography.json present");
});

// ───────────────────────────────────────────────────────────────────────────
// Test 4 — author-friendly error for malformed table
// ───────────────────────────────────────────────────────────────────────────

test("malformed table surfaces author-friendly warning", () => {
  const md = readFixture("malformed-table.md");
  const { warnings } = collectWarnings(md);
  assert.ok(warnings.length >= 1, "got at least one warning");
  const tableWarn = warnings.find(function (w) {
    return /missing the `\|---\|` header separator/.test(w);
  });
  assert.ok(
    tableWarn,
    "warning mentions separator row; got: " + warnings.join(" | "),
  );
  // Author-friendly tone — must NOT look like a stack trace or use jargon.
  assert.ok(
    !/at Object\.|TypeError|ReferenceError/.test(tableWarn),
    "warning should not contain a stack trace",
  );
  // Should suggest a fix.
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

  // No unrecognized-status warnings.
  const unknown = warnings.filter(function (w) {
    return /unrecognized status cell/.test(w);
  });
  assert.equal(
    unknown.length,
    0,
    "no unrecognized-status warnings; got: " + unknown.join(" | "),
  );

  const spacing = result.output["spacing.json"];
  assert.ok(spacing, "spacing.json emitted");
  assert.ok(spacing.rows && spacing.rows.length === 3, "3 rows present");

  const statuses = spacing.rows.map(function (r) {
    return r.status;
  });
  assert.deepEqual(statuses, ["shipped", "in-review", "proposed"]);
});

// ───────────────────────────────────────────────────────────────────────────
// Test 6 — coverage: file count tracks MD structure (not hardcoded)
// ───────────────────────────────────────────────────────────────────────────

test("file count is computed from MD structure, not hardcoded", () => {
  // Manually count what we expect from kristina-restructure.md:
  //   H2 "Color Primitives" → 2 H3s (oklch, primitives)
  //   H2 "Tokens" → 4 H3s (global-color, typography, borders, motion)
  //   H2 "Design Guidelines" → 1 H3 (color-usage-rules)
  //   H2 "Handoff Protocol" → skipped
  //   H2 "Related Guidelines" → skipped
  //   color-primitives has direct content? Then +1 "-overview"
  // → roughly 7-8 files
  const md = readFixture("kristina-restructure.md");
  const tokens = astWalk.parseMarkdown(md);
  const sections = astWalk.findEmitSections(tokens, {
    skipH2Slugs: derive.SKIP_H2_SLUGS,
  });
  const { result } = collectWarnings(md);
  assert.equal(
    Object.keys(result.output).length,
    sections.length,
    "one output file per emit section",
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 7 — paths-manifest auto-gen reflects actual dist files
// ───────────────────────────────────────────────────────────────────────────

test("paths-manifest foundations.* entries match dist files (live state)", () => {
  // Run derive in-memory, compare manifest update dry-run against existing
  // dist set. The actual paths-manifest.json on disk should already match
  // since derive ran during the build of this PR.
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "paths-manifest.json"), "utf8"),
  );
  const distDir = path.join(REPO_ROOT, "foundations", "dist");
  const distFiles = fs
    .readdirSync(distDir)
    .filter(function (f) {
      return /\.json$/.test(f);
    })
    .sort();

  const manifestFoundationsFiles = Object.entries(manifest.paths)
    .filter(function ([k, entry]) {
      // Auto-generated foundations.* entries point into foundations/dist/.
      // Skip the human-maintained foundations.md / foundations.authoring pointers.
      return (
        k.indexOf("foundations.") === 0 &&
        typeof entry.path === "string" &&
        entry.path.indexOf("foundations/dist/") === 0
      );
    })
    .map(function ([, entry]) {
      return path.basename(entry.path);
    })
    .sort();

  assert.deepEqual(
    manifestFoundationsFiles,
    distFiles,
    "manifest foundations.* entries should mirror foundations/dist/ JSON files",
  );

  // Marker note present.
  assert.ok(
    manifest._notes && manifest._notes.foundations_auto,
    "manifest carries the auto-generated marker note",
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Test 8 — slug derivation (known inputs → expected slugs)
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
    ["#### Brightness Filter — Interactive States", "brightness-filter-interactive-states"],
  ];
  for (const [raw, expected] of cases) {
    // Extract the heading text (after `## ` / `### `)
    const text = raw.replace(/^#+\s+/, "");
    const cleaned = astWalk.cleanHeading(text);
    const slug = astWalk.slugify(cleaned);
    assert.equal(slug, expected, "input '" + raw + "' produced '" + slug + "'");
  }
});

test("slug collisions get numeric suffixes", () => {
  const slugger = astWalk.createSlugger();
  assert.equal(slugger.slug("Breakpoints"), "breakpoints");
  assert.equal(slugger.slug("2.4 Breakpoints"), "breakpoints-1");
  assert.equal(slugger.slug("3.6 Breakpoints"), "breakpoints-2");
});

// ───────────────────────────────────────────────────────────────────────────
// Bonus: idempotent — running derive twice produces identical output
// ───────────────────────────────────────────────────────────────────────────

test("derive is idempotent (same input → same output)", () => {
  const md = readFixture("kristina-restructure.md");
  const r1 = derive.deriveFromMarkdown(md, { logger: { warn() {} } });
  const r2 = derive.deriveFromMarkdown(md, { logger: { warn() {} } });
  assert.deepEqual(r1.output, r2.output, "outputs match across runs");
  assert.deepEqual(r1.meta, r2.meta, "meta matches across runs");
});
