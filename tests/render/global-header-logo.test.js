"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var { deriveFragment } = require("../../scripts/render/derive-from-renderer.js");

test("global-header fills its logo slot with a real mark, not an empty span", function () {
  var frag = deriveFragment("global-header");
  assert.match(frag, /ds-header__logo/);
  assert.match(frag, /ds-header__logo[^>]*>\s*<svg/, "logo slot is still empty");
});
