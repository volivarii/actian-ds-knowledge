"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var { deriveFragment } = require("../../scripts/render/derive-from-renderer.js");

// Each wired consumer must EMBED its artwork, not just render its container. A
// color-only or structure-only gate cannot see an empty illustration slot.
test("empty-state embeds a real illustration svg", function () {
  var frag = deriveFragment("empty-state");
  assert.match(frag, /ds-empty-state__illustration[^>]*>\s*<svg class="ds-graphic"/,
    "empty-state illustration slot is empty: the graphics export regressed");
});

test("global-header embeds a real logo svg", function () {
  var frag = deriveFragment("global-header");
  assert.match(frag, /ds-header__logo[^>]*>\s*<svg class="ds-graphic"/,
    "global-header logo slot is empty: the graphics export regressed");
});
