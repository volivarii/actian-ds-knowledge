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
