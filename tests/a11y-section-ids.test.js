"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var derive = require("../scripts/accessibility/derive-a11y-index.js");

var md = fs.readFileSync(
  path.resolve(__dirname, "..", "accessibility", "accessibility.md"),
  "utf8",
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

test("slugs are auto-derived from heading text (no manual anchors)", function () {
  // accessibility.md headings must carry NO {#anchor}s — section ids come
  // from derive-a11y-index.js slugify(), matching the foundations MD-as-SoT
  // model. (Anchors elsewhere, e.g. in prose, are not headings and are fine.)
  var anchoredHeadings = md.split("\n").filter(function (l) {
    return /^#{2,3}\s/.test(l) && /\{#/.test(l);
  });
  assert.deepEqual(anchoredHeadings, [], "headings must not carry {#anchor}s");
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
