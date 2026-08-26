"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

var D = require("../../scripts/render/derive-from-renderer.js");
var M = require("../../components/render/renderer/matrix.js");

// Mirrors ds-html-map.js's esc(), kept independent (not imported) for the same
// oracle-independence reason fragment-invariants.test.js states: importing the
// producer's own escape would make these assertions blind to a bug in it.
function escLabel(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
// they survive the seeds: tag-read-only and checkbox are the derive-from-facts slugs
// (North Star slice 2) whose markup INTENTIONALLY diverges from the degraded capture
// (colored tag classes; real checkbox state classes + glyphs).
// The 2026-08-12 breaking sync replaced tag-read-only's Color axis with a single
// Type axis. This asserted `ds-tag--pink`, a hand-copied value from the retired
// axis, and it kept PASSING after the sync only because MATRIX_OVERRIDES still
// drove the dead axis through the renderer -- a green test over fabricated
// cells. The marker is derived from the registry now: whatever the published
// axis is, the fragment must colour its cells by that axis's own values.
test("deriveFragment(tag-read-only) colors each cell by a published variant value", function () {
  var derived = D.deriveFragment("tag-read-only");
  var comp = M.findComponent("tag-read-only");
  var axis = Object.keys(comp.variants)[0];
  var painted = comp.variants[axis].filter(function (value) {
    var mod = "ds-tag--" + String(value).toLowerCase().replace(/\s+/g, "-");
    return new RegExp("\\b" + mod + "\\b").test(derived);
  });
  assert.ok(
    painted.length > 1,
    "the fragment paints no " +
      axis +
      " value as a ds-tag--<value> modifier; painted: " +
      JSON.stringify(painted),
  );
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

// Same reason as above: the eight colour names were a copy of a retired axis.
// The property is "the curated override shows the WHOLE identity axis, not the
// generic 5-cell cap", and the registry is the only place that knows how many
// values that is.
test("tag-read-only renders every registry variant value, not the 5-cell generic cap", function () {
  var html = R.deriveFragment("tag-read-only");
  var comp = M.findComponent("tag-read-only");
  var axis = Object.keys(comp.variants)[0];
  var values = comp.variants[axis];
  assert.ok(
    values.length > 5,
    "the axis has " +
      values.length +
      " values, so the generic 5-cell cap cannot be distinguished from a " +
      "curated override and this test proves nothing",
  );
  var missing = values.filter(function (value) {
    // Rendered means the cell is there, keyed by its caption; the class is
    // asserted per value by the sibling test above (Default and Stage-1 carry
    // no modifier of their own by design).
    return html.indexOf(">" + escLabel(value) + "<") === -1;
  });
  assert.deepEqual(
    missing,
    [],
    "every published " + axis + " value must have a cell in the fragment",
  );
});
