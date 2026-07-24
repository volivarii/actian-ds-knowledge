"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var A = require("../../scripts/render/derive-appearance.js");
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

test("readAppearance: tag-default exposes 7 Color variants with backgrounds", function () {
  // Was 8 until the 2026-07-23 tag redesign. Gray is still a live Color on
  // the component (the registry lists it), but it now resolves to the same
  // fill as Color=Default, so it carries no delta and the capture has nothing
  // to record for it. The remaining seven are the hues that do differ.
  var a = A.readAppearance("tag-default", ANATOMY);
  var colors = a.variants.filter(function (v) {
    return v.prop === "Color";
  });
  assert.equal(colors.length, 7);
  colors.forEach(function (v) {
    assert.match(v.background, /^#|^rgb|^oklch/i);
  });
});
