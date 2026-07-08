"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var S = require("../scripts/sync/sync-from-figma.js");

var ROOT = path.resolve(__dirname, "..");

test("loadPageOverrides reads the committed config with the icon + alert entries", function () {
  var cfg = S.loadPageOverrides(ROOT);
  assert.ok(cfg, "config loaded");
  assert.equal(cfg.overrides["DS Icons"], "Icons");
  assert.equal(cfg.overrides["Alert (banner)"], "Feedback");
  assert.ok(cfg.exclude.includes("DS Icons: replacement"));
});

test("loadPageOverrides returns null when the config is absent", function () {
  assert.equal(S.loadPageOverrides("/nonexistent/plugin/dir"), null);
});

function reg(catCounts) {
  var comps = {};
  var n = 0;
  Object.keys(catCounts).forEach(function (cat) {
    for (var i = 0; i < catCounts[cat]; i++) {
      comps["c" + n++] = { category: cat };
    }
  });
  return { components: comps };
}

test("assertNoCategoryMassLoss: throws when a >=10 member category drops to 0", function () {
  var before = reg({ Icons: 237, Feedback: 10 });
  var after = reg({ Feedback: 10 });
  assert.throws(function () {
    S.assertNoCategoryMassLoss(before, after, { allow: [] });
  }, /category mass-loss/);
});

test("assertNoCategoryMassLoss: no throw for a small drop (below floor)", function () {
  var before = reg({ Feedback: 10 });
  var after = reg({ Feedback: 9 }); // Feedback still > 0
  assert.doesNotThrow(function () {
    S.assertNoCategoryMassLoss(before, after, { allow: [] });
  });
});

test("assertNoCategoryMassLoss: a <10 member category vanishing does not trip", function () {
  var before = reg({ Tiny: 9 });
  var after = reg({});
  assert.doesNotThrow(function () {
    S.assertNoCategoryMassLoss(before, after, { allow: [] });
  });
});

test("assertNoCategoryMassLoss: allow-list acknowledges an intentional removal", function () {
  var before = reg({ Icons: 237 });
  var after = reg({});
  assert.doesNotThrow(function () {
    S.assertNoCategoryMassLoss(before, after, { allow: ["Icons"] });
  });
});
