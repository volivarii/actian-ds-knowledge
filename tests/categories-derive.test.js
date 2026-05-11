"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var parser = require("../scripts/categories/categories-parser.js");

test("extractFrontmatter — happy path", function () {
  var input = [
    "---",
    "slug: form-input-selection",
    "label: Form (input & selection)",
    "authoring_status: engineer-seed",
    "confidence:",
    "  anatomy: medium",
    "  variants: medium",
    "  motion: high",
    "  a11y: high",
    "last_reviewed: 2026-05-11",
    "---",
    "",
    "# Form — category defaults",
    "",
  ].join("\n");

  var fm = parser.extractFrontmatter(input);

  assert.equal(fm.frontmatter.slug, "form-input-selection");
  assert.equal(fm.frontmatter.label, "Form (input & selection)");
  assert.equal(fm.frontmatter.authoring_status, "engineer-seed");
  assert.equal(fm.frontmatter.confidence.anatomy, "medium");
  assert.equal(fm.frontmatter.confidence.motion, "high");
  assert.equal(fm.body.indexOf("# Form"), 0);
});

test("extractFrontmatter — missing fence throws", function () {
  assert.throws(function () {
    parser.extractFrontmatter("# Just a body\n\nNo frontmatter.");
  }, /missing frontmatter/i);
});

test("extractSections — splits H2-headed sections", function () {
  var body = [
    "# Header (ignored at top)",
    "",
    "Intro prose (ignored).",
    "",
    "## Anatomy",
    "",
    "- **Container** — outer wrapper",
    "- **Label** — caller-supplied",
    "",
    "## Variants",
    "",
    "- **State** (axis): `default | focus | error`",
    "",
    "## Motion",
    "",
    '- pattern: "State Transitions"',
    "",
    "## Accessibility",
    "",
    "- **Label association** (WCAG 1.3.1)",
    "",
  ].join("\n");

  var sections = parser.extractSections(body);
  assert.ok(sections.Anatomy, "Anatomy section present");
  assert.ok(sections.Anatomy.indexOf("Container") > -1);
  assert.ok(sections.Variants, "Variants section present");
  assert.ok(sections.Motion, "Motion section present");
  assert.ok(sections.Accessibility, "Accessibility section present");
});

test("parseBulletList — extracts name+description pairs", function () {
  var sectionBody = [
    "Some intro prose to skip.",
    "",
    "- **Container** — outer wrapper, applies elevation and radius",
    "- **Label** — caller-supplied; bound via for/aria-labelledby",
    "- **Icon (optional)** — leading or trailing decorative element",
    "",
    "Trailing prose to skip.",
  ].join("\n");

  var items = parser.parseBulletList(sectionBody);
  assert.equal(items.length, 3);
  assert.equal(items[0].name, "Container");
  assert.equal(
    items[0].description,
    "outer wrapper, applies elevation and radius",
  );
  assert.equal(items[1].name, "Label");
  assert.equal(items[2].name, "Icon (optional)");
});

test("parseBulletList — handles em-dash and hyphen separators", function () {
  var items = parser.parseBulletList(
    "- **Foo** — em dash separator\n- **Bar** - hyphen separator",
  );
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Foo");
  assert.equal(items[0].description, "em dash separator");
  assert.equal(items[1].name, "Bar");
  assert.equal(items[1].description, "hyphen separator");
});

test("parseVariantAxes — extracts axis+values from bullet format", function () {
  var sectionBody = [
    "- **State** (axis): `default | focus | error | disabled`",
    "- **Size** (axis): `small | medium | large`",
    "- **Label position** (axis): `top | inline`",
  ].join("\n");

  var axes = parser.parseVariantAxes(sectionBody);
  assert.equal(axes.length, 3);
  assert.equal(axes[0].axis, "State");
  assert.deepEqual(axes[0].values, ["default", "focus", "error", "disabled"]);
  assert.equal(axes[1].axis, "Size");
  assert.deepEqual(axes[1].values, ["small", "medium", "large"]);
});
