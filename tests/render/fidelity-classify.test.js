"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var C = require("../../scripts/render/fidelity-classify.js");

var TOKENS = {
  "--zen-color-bg-subtle": "#f5f5f8",
  "--zen-border-default": "#c7c7ce",
  "--zen-border-width-md": "1px",
  "--zen-spacing-2xs": "4px",
};

test("colorOf: a color-valued token resolves", function () {
  assert.deepEqual(C.colorOf("background", "var(--zen-color-bg-subtle)", TOKENS), {
    token: "--zen-color-bg-subtle",
    resolved: "#f5f5f8",
  });
});

// The whole reason the earlier probe produced 1446 bogus findings: a spacing
// token checked against a color fact set.
test("colorOf: a non-color token is not a color", function () {
  assert.equal(C.colorOf("padding", "var(--zen-spacing-2xs)", TOKENS), null);
});

// Shorthand `border: 1px solid var(--color)` must yield the COLOR, not the
// width. Taking the first var() picked --zen-border-width-md=1px and compared
// "1px" against a hex fact.
test("colorOf: shorthand border yields its color component, not its width", function () {
  var got = C.colorOf(
    "border",
    "var(--zen-border-width-md) solid var(--zen-border-default)",
    TOKENS,
  );
  assert.deepEqual(got, { token: "--zen-border-default", resolved: "#c7c7ce" });
});

test("colorOf: a literal hex is a color", function () {
  assert.deepEqual(C.colorOf("color", "#b1374d", TOKENS), {
    token: null,
    resolved: "#b1374d",
  });
});

test("colorOf: a keyword with no resolvable color is not a color", function () {
  assert.equal(C.colorOf("background", "none", TOKENS), null);
  assert.equal(C.colorOf("border", "var(--zen-border-width-md) solid transparent", TOKENS), null);
});

test("kindOf maps properties to fact kinds", function () {
  assert.equal(C.kindOf("background-color"), "background");
  assert.equal(C.kindOf("color"), "text");
  assert.equal(C.kindOf("fill"), "text");
  assert.equal(C.kindOf("border-bottom"), "border");
  assert.equal(C.kindOf("outline-color"), "border");
  assert.equal(C.kindOf("padding"), null);
});

// The subject of a rule is its RIGHTMOST compound. `.ds-tag--indigo
// .ds-tag-stage__dot` paints the dot, not the container. Reading the leftmost
// compared the dot's fill against the container's variant background and
// produced 14 false mismatches.
test("rightmost returns the targeted compound", function () {
  assert.equal(C.rightmost(".ds-tag--indigo .ds-tag-stage__dot"), ".ds-tag-stage__dot");
  assert.equal(C.rightmost(".ds-alert__icon"), ".ds-alert__icon");
  assert.equal(C.rightmost(".ds-card > .ds-card__title"), ".ds-card__title");
  assert.equal(C.rightmost(".ds-alert--primary, .ds-alert--success"), ".ds-alert--primary");
});

test("classifySelector buckets by what the rule targets", function () {
  assert.deepEqual(C.classifySelector(".ds-alert", "ds-alert"), { bucket: "root" });
  assert.deepEqual(C.classifySelector(".ds-alert--warning", "ds-alert"), {
    bucket: "modifier",
    modifier: "warning",
  });
  assert.deepEqual(C.classifySelector(".ds-alert__title", "ds-alert"), { bucket: "element" });
  assert.deepEqual(C.classifySelector(".ds-link:hover", "ds-link"), { bucket: "state" });
  assert.deepEqual(C.classifySelector(".ds-tag--indigo .ds-tag-stage__dot", "ds-tag"), {
    bucket: "element",
  });
});

test("classifySelector treats an unrelated rightmost compound as unattributable", function () {
  assert.deepEqual(C.classifySelector(".ds-header .ds-icon", "ds-header"), { bucket: "other" });
});
