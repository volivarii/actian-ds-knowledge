"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var { deriveFragment } = require("../../scripts/render/derive-from-renderer.js");

test("empty-state renders illustration + title + body + two buttons", function () {
  var frag = deriveFragment("empty-state");
  assert.match(frag, /class="ds-graphic"/, "no illustration svg");
  assert.match(frag, /ds-empty-state__headline/);
  assert.match(frag, /ds-empty-state__body/);
  var buttons = (frag.match(/ds-empty-state__cta|ds-button/g) || []).length;
  assert.ok(buttons >= 2, "expected a two-button row, saw " + buttons);
  assert.doesNotMatch(frag, /Nothing here yet/, "still the stub default");
});
