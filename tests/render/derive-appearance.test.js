"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var A = require("../../scripts/render/derive-appearance.js");
var MATRIX = require("../../components/render/renderer/matrix.js");
var ANATOMY = path.resolve(__dirname, "../../components/dist/anatomy");

test("loadTokenMap: parses --zen-* declarations, first wins", function () {
  var map = A.loadTokenMap(":root{--zen-a:#111;--zen-b:#222}.x{--zen-a:#999}");
  assert.equal(map["--zen-a"], "#111");
  assert.equal(map["--zen-b"], "#222");
});

test("bindColor: value-first, token only when it round-trips", function () {
  var map = { "--zen-good": "#0f5fdc", "--zen-stale": "#f3f5f9" };
  assert.equal(A.bindColor("#0f5fdc", "--zen-good", map), "var(--zen-good)");
  assert.equal(A.bindColor("#edf6ff", "--zen-stale", map), "#edf6ff"); // stale token -> value
  assert.equal(A.bindColor("#abc123", undefined, map), "#abc123"); // no token -> value
});

// The 2026-08-12 breaking sync folded five tag-family components into
// tag-default and replaced its Color axis with a single Type axis. This test
// used to pin `Color` and a literal count of 7, so it asserted an axis Figma
// had deleted -- a hardcoded copy of a fact the registry and the capture both
// own, which is exactly what went stale.
//
// Rewritten as a cross-check between two independent sources instead: the
// registry says which axis tag-default publishes and which values it carries,
// the anatomy says which of those values carry a captured colour delta. No
// count and no axis name is spelled out here, so the next axis change reds
// only if the two sources genuinely disagree.
test("readAppearance: tag-default's variants are keyed by the axis the registry publishes, and every colour group names published values", function () {
  var comp = MATRIX.findComponent("tag-default");
  assert.ok(comp && comp.variants, "tag-default is absent from every registry");
  var axes = Object.keys(comp.variants);
  assert.equal(
    axes.length,
    1,
    "tag-default is expected to publish exactly one axis, got " +
      JSON.stringify(axes),
  );
  var axis = axes[0];
  var published = comp.variants[axis];

  var a = A.readAppearance("tag-default", ANATOMY);
  assert.ok(a.variants.length > 0, "the capture records no variants at all");

  var offAxis = a.variants
    .map(function (v) {
      return v.prop;
    })
    .filter(function (p) {
      return p !== axis;
    });
  assert.deepEqual(
    offAxis,
    [],
    "the capture carries variant groups on an axis the registry does not " +
      "publish (a retired axis still being read): " +
      JSON.stringify(offAxis),
  );

  var withBackground = a.variants.filter(function (v) {
    return !!v.background;
  });
  assert.ok(
    withBackground.length > 0,
    "no variant group carries a background, so there is no colour delta to " +
      "render the axis from",
  );
  withBackground.forEach(function (v) {
    assert.match(v.background, /^#|^rgb|^oklch/i);
    v.values.forEach(function (val) {
      assert.ok(
        published.indexOf(val) !== -1,
        axis +
          "=" +
          val +
          " carries a captured colour but the registry does not publish it",
      );
    });
  });
});
