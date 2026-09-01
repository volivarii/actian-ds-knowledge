"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

// PR α.5 v2 (v0.4.1+): foundations/dist/ is a hierarchical tree (Pattern H).
// Foundations dist files are covered by the content-agnostic walk test below
// (it asserts _schema_version: 1 on every JSON under foundations/dist/), so
// this pinned list only carries the stable non-foundations entries. Authors
// can restructure foundations.md without breaking these tests.
// The registries are READ from the deriver, not restated: a fourth kit added to
// REGISTRY_FILES must be checked for _schema_version without a second edit here.
var FILES_REQUIRING_SCHEMA_VERSION =
  require("../scripts/lib/registry-files.js").concat([
    "components/dist/categories.json",
    "tokens/tokens.json",
    "app-context/dist/app-context.json",
    "accessibility/dist/a11y-index.json",
    "components/src/icon-groups.json",
  ]);

FILES_REQUIRING_SCHEMA_VERSION.forEach(function (relPath) {
  test("schema_version present in " + relPath, function () {
    var data = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf8"),
    );
    // Presence and shape, NOT a pinned 1. This file's own purpose is to catch
    // an artifact emitted without the field; asserting the literal 1 also
    // forbids every legitimate bump, and app-context/dist went to 2 when a
    // relationship verb started carrying a list of targets rather than one.
    assert.ok(
      Number.isInteger(data._schema_version) && data._schema_version >= 1,
      relPath + " missing a positive integer _schema_version",
    );
  });
});

// Coverage test: every per-leaf + every _index.json in foundations/dist/
// carries _schema_version: 1. Catches regressions where a leaf shape is
// emitted without the version field.
test("all foundations/dist JSONs carry _schema_version: 1", function () {
  var distDir = path.resolve(__dirname, "..", "foundations", "dist");
  function walk(dir, acc) {
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach(function (e) {
      var full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, acc);
      else if (e.isFile() && /\.json$/.test(e.name)) acc.push(full);
    });
    return acc;
  }
  var jsons = walk(distDir, []);
  assert.ok(
    jsons.length >= 50,
    "expected ≥50 dist JSON files, got " + jsons.length,
  );
  jsons.forEach(function (p) {
    var data = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.equal(data._schema_version, 1, p + " missing _schema_version: 1");
  });
});
