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

  // 'DS Icons: replacement' used to be EXCLUDED (added 2026-07-08, when it was a
  // staging page). The 2026-07 icon rework then moved the real icon library onto
  // it: 201 of the 237 registry icon components are main components on that page.
  // Excluding it therefore deleted the entire Icons category (237 -> 0), the
  // mass-loss tripwire correctly refused to publish a gutted registry, and the
  // nightly Figma sync failed every night from 2026-07-10.
  //
  // It must resolve to the Icons category, and it must NOT be excluded. If a
  // future change re-excludes it while the icons live there, the sync dies again.
  assert.equal(
    cfg.overrides["DS Icons: replacement"],
    "Icons",
    "the icon library lives on this page; it must resolve to a category",
  );
  assert.ok(
    !cfg.exclude.includes("DS Icons: replacement"),
    "excluding this page guts the entire Icons category and kills the nightly sync",
  );
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
