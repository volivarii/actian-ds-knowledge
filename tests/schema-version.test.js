"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var FILES_REQUIRING_SCHEMA_VERSION = [
  "foundations/dist/color.json",
  "foundations/dist/borders.json",
  "foundations/dist/spacing.json",
  "foundations/dist/typography.json",
  "foundations/dist/elevation.json",
  "foundations/dist/icons.json",
  "foundations/dist/interaction-motion.json",
  "foundations/dist/breakpoint-grid-structure.json",
  "components/dist/registries/dskit.json",
  "components/dist/registries/fmkit.json",
  "components/dist/registries/metakit.json",
  "components/dist/categories.json",
  "tokens/tokens.json",
  "app-context/app-context.json",
  "fm-to-ds-map/fm-to-ds-map.json"
];

FILES_REQUIRING_SCHEMA_VERSION.forEach(function (relPath) {
  test("schema_version present in " + relPath, function () {
    var data = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, "..", relPath),
      "utf8"
    ));
    assert.equal(data._schema_version, 1, relPath + " missing _schema_version: 1");
  });
});
