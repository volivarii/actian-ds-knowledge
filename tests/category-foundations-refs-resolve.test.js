"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var REPO_ROOT = path.resolve(__dirname, "..");
var CAT_DIST = path.join(REPO_ROOT, "components", "dist", "categories");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

var indexSlugs = new Set(
  readJson(
    path.join(REPO_ROOT, "foundations", "dist", "foundations-index.json"),
  ).sections.map(function (s) {
    return s.slug;
  }),
);

function collectFoundationsRefs() {
  var out = [];
  var files = fs.readdirSync(CAT_DIST).filter(function (f) {
    return f.endsWith("-defaults.json");
  });
  files.forEach(function (f) {
    var json = readJson(path.join(CAT_DIST, f));
    var block = json.foundations_refs;
    if (block && Array.isArray(block.sectionRefs)) {
      block.sectionRefs.forEach(function (r) {
        out.push({ file: f, ref: r.ref });
      });
    }
  });
  return out;
}

var refs = collectFoundationsRefs();

test("every category foundations_refs ref resolves to a foundations-index slug", function () {
  var unresolved = refs.filter(function (r) {
    return !indexSlugs.has(r.ref);
  });
  assert.deepEqual(
    unresolved,
    [],
    "unresolved foundations_refs:\n" +
      unresolved
        .map(function (r) {
          return "  " + r.file + " → '" + r.ref + "'";
        })
        .join("\n") +
      "\n\nValid slugs live in foundations/dist/foundations-index.json#sections[*].slug.",
  );
});

test("at least one category carries foundations_refs (smoke)", function () {
  assert.ok(
    refs.length > 0,
    "no foundations_refs found in components/dist/categories — backfill or projection likely broken",
  );
});
