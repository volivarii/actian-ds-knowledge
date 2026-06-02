"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var { buildPaths, buildPathsFromManifest } = require("../clients/resolve-paths.js");

var MANIFEST = {
  manifest_schema_version: "v1",
  paths: {
    "accessibility.index": { path: "accessibility/dist/a11y-index.json", type: "json", origin: "ci", description: "x" },
  },
  collections: {
    "content.section": { dir: "content/src", pattern: "{slug}.md", type: "markdown", origin: "human", description: "y" },
  },
};

test("buildPathsFromManifest joins entry paths onto vendorRoot", function () {
  var P = buildPathsFromManifest(MANIFEST, "/v");
  assert.equal(P.accessibility.index, path.join("/v", "accessibility/dist/a11y-index.json"));
  assert.equal(typeof P.content.section, "function");
  assert.equal(P.content.section("forms"), path.join("/v", "content/src", "forms.md"));
});

test("buildPaths reads <vendorRoot>/paths-manifest.json and resolves", function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-"));
  fs.writeFileSync(path.join(dir, "paths-manifest.json"), JSON.stringify(MANIFEST));
  var P = buildPaths(dir);
  assert.equal(P.accessibility.index, path.join(dir, "accessibility/dist/a11y-index.json"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("buildPathsFromManifest rejects an unsupported manifest_schema_version", function () {
  assert.throws(function () {
    buildPathsFromManifest({ manifest_schema_version: "v2", paths: {}, collections: {} }, "/v");
  }, /manifest_schema_version/);
});
