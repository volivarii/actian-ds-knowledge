"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var derive = require("../scripts/accessibility/derive-a11y-index.js");

var md = derive.concatA11ySources(
  path.resolve(__dirname, "..", "accessibility", "src"),
);

var idx = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "..", "accessibility", "dist", "a11y-index.json"),
    "utf8",
  ),
);

test("a11y-index.json sections are well-formed", function () {
  assert.ok(idx.sections.length > 0);
  idx.sections.forEach(function (s) {
    assert.ok(s.slug, "section missing slug");
    assert.ok(s.title, "section missing title");
    assert.ok(Array.isArray(s.wcag), "section wcag must be array");
  });
});

test("section slugs are unique (auto-slug first-wins dedup)", function () {
  var slugs = idx.sections.map(function (s) {
    return s.slug;
  });
  var dups = slugs.filter(function (s, n) {
    return slugs.indexOf(s) !== n;
  });
  assert.deepEqual(dups, [], "duplicate slugs: " + dups.join(", "));
});

test("a11y-index.json is in sync with accessibility.md", function () {
  // The index is auto-derived; this guards against the source MD changing
  // without the dist being regenerated.
  assert.deepEqual(idx, derive.deriveA11yIndex(md));
});

test("every H2/H3 heading carries an explicit {#anchor} marker (D1)", function () {
  // Every H2/H3 across accessibility/src/* MUST carry an explicit {#slug}
  // anchor — the anchor is the consumer-visible contract (P6 of the Agnostic
  // Substrate Doctrine; D1 of R6 pre-build). Heading text can change freely;
  // the anchor must remain stable. The anchor regex matches the one in
  // derive-a11y-index.js (extractSlugFromHeading).
  var bareHeadings = md.split("\n").filter(function (l) {
    return /^#{2,3}\s/.test(l) && !/\{#[a-z0-9-]+\}\s*$/.test(l);
  });
  assert.deepEqual(
    bareHeadings,
    [],
    "every H2/H3 in accessibility/src/*.md must end with {#slug}; missing on:\n" +
      bareHeadings.join("\n"),
  );
});

test("extractSlugFromHeading uses explicit {#anchor} when present (D1)", function () {
  assert.equal(
    derive.extractSlugFromHeading("## Color contrast {#color-contrast}"),
    "color-contrast",
  );
});

test("extractSlugFromHeading falls back to slugification when no anchor (D1)", function () {
  assert.equal(
    derive.extractSlugFromHeading("## Color contrast"),
    "color-contrast",
  );
});

test("extractSlugFromHeading: explicit anchor wins when it differs from slugification (D1)", function () {
  assert.equal(
    derive.extractSlugFromHeading(
      "## Color Contrast (AA & AAA) {#color-contrast}",
    ),
    "color-contrast",
  );
});

test("extractHeadingText strips the {#anchor} marker (D1)", function () {
  assert.equal(
    derive.extractHeadingText("## Color contrast {#color-contrast}"),
    "Color contrast",
  );
});

test("slugify fallback still works for non-anchored prose (D1)", function () {
  assert.equal(derive.slugify("5. Focus & Keyboard"), "focus-keyboard");
  assert.equal(derive.slugify("Data Tables"), "data-tables");
});

test("per-component sub-sections are indexed with their WCAG criteria", function () {
  var buttons = idx.sections.find(function (s) {
    return s.slug === "buttons";
  });
  assert.ok(buttons, "buttons sub-section must exist");
  assert.ok(
    buttons.wcag.includes("2.1.1"),
    "buttons must include 2.1.1 (Keyboard)",
  );

  var modals = idx.sections.find(function (s) {
    return s.slug === "modals";
  });
  assert.ok(modals, "modals sub-section must exist");
  assert.ok(
    modals.wcag.includes("2.5.8"),
    "modals must include 2.5.8 (Target Size)",
  );
});

test("granular slugs referenced by category defaults exist in the index", function () {
  // components/src/categories/*.md reference these a11y slugs via
  // `{ ref: <slug> }` frontmatter — guard against orphaned refs.
  var referenced = [
    "focus-keyboard",
    "color-contrast",
    "aria-labels",
    "motion",
    "typography",
    "error-prevention",
    "forms",
    "states",
    "data-tables",
    "alerts-toasts-banners",
  ];
  var idxSlugs = idx.sections.map(function (s) {
    return s.slug;
  });
  referenced.forEach(function (slug) {
    assert.ok(
      idxSlugs.indexOf(slug) !== -1,
      "category-referenced a11y slug missing from index: " + slug,
    );
  });
});
