"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

var D = require("../../scripts/render/derive-from-renderer.js");

// Phase 1a pinned deriveFragment("button"/"badge"/"tag-interactive") byte-for-byte
// against the frozen captures in components/render/src/. Those three tests retired
// with the seeds at renderer-relocation phase 3, for the same reason as the all-35
// oracle: byte-identity against a historical capture proved the port from the plugin
// preserved behavior, which is migration safety, and the migration completed and was
// verified end-to-end at phase 2. Structural coverage for every slug now comes from
// tests/render/fragment-invariants.test.js, which asserts fact-derived invariants
// instead, so a legitimate Figma sync cannot make it stale.
//
// The tests below assert the renderer's output POSITIVELY, by marker, which is why
// they survive the seeds: tag-default and checkbox are the derive-from-facts slugs
// (North Star slice 2) whose markup INTENTIONALLY diverges from the degraded capture
// (colored tag classes; real checkbox state classes + glyphs).
test("deriveFragment(tag-default) colors each cell via ds-tag--<color>", function () {
  var derived = D.deriveFragment("tag-default");
  assert.match(derived, /ds-tag--pink/);
});

test("deriveFragment(checkbox) emits distinct classes + glyphs per Selection state", function () {
  var derived = D.deriveFragment("checkbox");
  assert.match(derived, /ds-checkbox--checked/);
  assert.match(derived, /ds-checkbox--indeterminate/);
  assert.match(
    derived,
    /<rect x="5" y="11" width="14" height="2" rx="1" fill="currentColor"\/>/,
  );
  assert.match(derived, /is-disabled/);
});

var R = require("../../scripts/render/derive-from-renderer.js");

test("radio derives a real Selected state, not the Selected==='Yes' bug", function () {
  var html = R.deriveFragment("radio");
  assert.match(
    html,
    /ds-radio--checked/,
    "the Selected cell emits ds-radio--checked",
  );
  assert.match(
    html,
    /ds-radio\b[^"]*\bis-disabled/,
    "the Disabled cell emits is-disabled",
  );
});

test("toggle derives a real On state, not the Selected==='Yes' bug", function () {
  var html = R.deriveFragment("toggle");
  assert.match(html, /ds-toggle--on/, "the On cell emits ds-toggle--on");
  assert.match(
    html,
    /ds-toggle\b[^"]*\bis-disabled/,
    "the Disabled cell emits is-disabled",
  );
});

test("tag-default renders every registry color, not the 5-cell generic cap", function () {
  var html = R.deriveFragment("tag-default");
  [
    "pink",
    "purple",
    "indigo",
    "yellow",
    "lime",
    "teal",
    "orange",
    "gray",
  ].forEach(function (c) {
    assert.match(
      html,
      new RegExp("ds-tag--" + c + "\\b"),
      "tag color " + c + " is rendered",
    );
  });
});
