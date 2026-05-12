"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "paths-manifest.json"), "utf8"),
);

// Convention: leaf-XOR-namespace. No key in paths or collections (or
// across them) shares a prefix-leaf relationship with any other key.
// I.e., if "foo" exists, "foo.bar" must NOT exist (and vice versa).
//
// Rationale: the plugin's manifest reader (scripts/lib/paths.js in
// actian-design-system-plugin) builds a dot-walked PATHS object where
// each key is either a string leaf (file path) or a sub-object
// (namespace), never both. Coexistence breaks the reader.
//
// To add a sibling artifact next to an existing leaf, rename the leaf:
//   BAD:  accessibility + accessibility.index
//   GOOD: accessibility.guide + accessibility.index
//
// See _naming_convention field in paths-manifest.json for the canonical
// statement of the rule.

function collectAllKeys(manifest) {
  var keys = [];
  if (manifest.paths) {
    for (var k in manifest.paths) {
      if (Object.prototype.hasOwnProperty.call(manifest.paths, k)) keys.push(k);
    }
  }
  if (manifest.collections) {
    for (var c in manifest.collections) {
      if (Object.prototype.hasOwnProperty.call(manifest.collections, c)) keys.push(c);
    }
  }
  return keys;
}

function findPrefixCollisions(keys) {
  var collisions = [];
  var sorted = keys.slice().sort();
  for (var i = 0; i < sorted.length; i++) {
    for (var j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      var a = sorted[i];
      var b = sorted[j];
      // a is a prefix of b at a dot boundary
      if (b.length > a.length && b.indexOf(a + ".") === 0) {
        collisions.push(a + " <-> " + b);
      }
    }
  }
  return collisions;
}

test("manifest convention — every key is leaf XOR namespace (no prefix collisions)", function () {
  var keys = collectAllKeys(manifest);
  var collisions = findPrefixCollisions(keys);
  // De-duplicate symmetric pairs
  var uniq = Array.from(new Set(collisions));
  assert.deepEqual(
    uniq,
    [],
    "Found prefix collisions (leaf + namespace coexist): " +
      uniq.join("; ") +
      ". Per _naming_convention in paths-manifest.json, rename one side. " +
      "Example: 'accessibility' + 'accessibility.index' → 'accessibility.guide' + 'accessibility.index'.",
  );
});

test("manifest convention — _naming_convention field is present and non-trivial", function () {
  assert.ok(
    typeof manifest._naming_convention === "string",
    "_naming_convention field must exist",
  );
  assert.ok(
    manifest._naming_convention.length > 80,
    "_naming_convention should be a real sentence, not a placeholder",
  );
});
