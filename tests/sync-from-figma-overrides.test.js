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
