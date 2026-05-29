"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var derive = require("../scripts/categories/derive-categories.js");

function mdWith(foundationsBlock) {
  return [
    "---",
    "_schema_version: 2",
    "slug: data-display",
    "label: Data Display",
    "authoring_status: engineer-seed",
    "confidence: { anatomy: medium, variants: high, motion: high, a11y: high }",
    "last_reviewed: 2026-05-12",
    "anatomy:",
    "  - { name: Container, description: the surface }",
    "  - { name: Row, description: a data row }",
    "variants:",
    "  - { axis: Style, values: [primary] }",
    "motion_refs:",
    "  - { ref: state-transitions }",
    "a11y_refs:",
    "  - { ref: focus-keyboard }",
    "  - { ref: color-contrast }",
    "  - { ref: aria-labels }",
  ].concat(foundationsBlock).concat(["---", "# Data Display", ""]).join("\n");
}

test("projectToDist wraps foundations_refs as sectionRefs", function () {
  var md = mdWith(["foundations_refs:", "  - { ref: tokens, note: spacing }"]);
  var out = derive.deriveCategoryFile(md, "categories/data-display.md", {});
  assert.deepEqual(out.dist.foundations_refs, { sectionRefs: [{ ref: "tokens", note: "spacing" }] });
});

test("dist omits foundations_refs when frontmatter has none", function () {
  var md = mdWith([]);
  var out = derive.deriveCategoryFile(md, "categories/data-display.md", {});
  assert.ok(!("foundations_refs" in out.dist), "foundations_refs should be absent when not authored");
});
