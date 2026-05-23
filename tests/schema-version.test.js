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
var FILES_REQUIRING_SCHEMA_VERSION = [
  "components/dist/registries/dskit.json",
  "components/dist/registries/fmkit.json",
  "components/dist/registries/metakit.json",
  "components/dist/categories.json",
  "tokens/tokens.json",
  "app-context/app-context.json",
  "fm-to-ds-map/fm-to-ds-map.json",
  "accessibility/dist/a11y-index.json",
  "components/src/icon-groups.json",
];

FILES_REQUIRING_SCHEMA_VERSION.forEach(function (relPath) {
  test("schema_version present in " + relPath, function () {
    var data = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf8"),
    );
    assert.equal(
      data._schema_version,
      1,
      relPath + " missing _schema_version: 1",
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
