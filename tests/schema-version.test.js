"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

// Hand-listed files outside foundations/dist — these have stable, hand-chosen
// names that don't change with author edits, so we enumerate them explicitly.
var EXPLICIT_FILES = [
  "components/dist/registries/dskit.json",
  "components/dist/registries/fmkit.json",
  "components/dist/registries/metakit.json",
  "components/dist/categories.json",
  "tokens/tokens.json",
  "app-context/app-context.json",
  "fm-to-ds-map/fm-to-ds-map.json",
  "accessibility/dist/a11y-index.json",
];

// foundations/dist/ is enumerated dynamically because the file set is derived
// from the MD structure (schema-less derive, PR α.5) — adding/removing/renaming
// a heading changes which files exist. The invariant is: every JSON in
// foundations/dist/ has _schema_version: 1.
var FOUNDATIONS_DIST = path.resolve(__dirname, "..", "foundations", "dist");

EXPLICIT_FILES.forEach(function (relPath) {
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

test("every JSON in foundations/dist/ has _schema_version: 1", function () {
  var files = fs.readdirSync(FOUNDATIONS_DIST).filter(function (f) {
    return /\.json$/.test(f);
  });
  assert.ok(files.length > 0, "foundations/dist/ is empty — derive ran?");
  files.forEach(function (f) {
    var data = JSON.parse(
      fs.readFileSync(path.join(FOUNDATIONS_DIST, f), "utf8"),
    );
    assert.equal(
      data._schema_version,
      1,
      "foundations/dist/" + f + " missing _schema_version: 1",
    );
  });
});
