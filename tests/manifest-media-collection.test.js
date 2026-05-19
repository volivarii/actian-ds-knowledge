"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");

var manifest = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "..", "paths-manifest.json"), "utf8"));

test("manifest declares components.media.ci collection", function () {
  var c = manifest.collections["components.media.ci"];
  assert.ok(c, "components.media.ci must be present in collections");
  assert.equal(c.dir, "components/dist/media");
  assert.equal(c.pattern, "{slug}/{role}.{ext}");
  assert.equal(c.type, "binary");
  assert.equal(c.origin, "ci");
  assert.equal(c.recursive, true);
  assert.ok(c.description && c.description.length > 0, "description required");
});

test("media collection does not collide with sibling keys (leaf-XOR-namespace)", function () {
  var all = Object.keys(manifest.collections).concat(Object.keys(manifest.paths));
  // Forbidden: a "components.media" bare leaf coexisting with "components.media.ci".
  assert.equal(all.indexOf("components.media"), -1,
    "components.media (bare leaf) must not coexist with components.media.ci");
});
