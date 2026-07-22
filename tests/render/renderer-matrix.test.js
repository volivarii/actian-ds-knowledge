"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var M = require("../../components/render/renderer/matrix.js");

test("RENDER_SLUGS lists the gallery slugs including button", function () {
  assert.ok(Array.isArray(M.RENDER_SLUGS) && M.RENDER_SLUGS.length >= 33);
  assert.ok(M.RENDER_SLUGS.indexOf("button") >= 0);
});

test("button matrix comes from the curated override (Intent x Emphasis)", function () {
  var cells = M.variantMatrix("button");
  var labels = cells.map(function (c) {
    return c.label;
  });
  assert.ok(
    labels.some(function (l) {
      return /critical/i.test(l);
    }),
    "has a Critical cell",
  );
  assert.ok(
    cells.every(function (c) {
      return c.props && "Label" in c.props;
    }),
    "cells carry a Label prop",
  );
});

test("findComponent is ds-first-wins for a dual-kit slug", function () {
  var e = M.findComponent("calendar");
  assert.ok(
    e && e.variants,
    "calendar resolves to a registry entry with variants",
  );
});
