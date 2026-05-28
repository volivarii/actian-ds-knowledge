"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var astWalk = require("../scripts/foundations/foundations-parser/ast-walk.js");
var deriveFoundations = require("../scripts/foundations/derive-foundations.js");

var REPO_ROOT = path.resolve(__dirname, "..");
var SRC_DIR = path.join(REPO_ROOT, "foundations", "src");
var INDEX_PATH = path.join(
  REPO_ROOT,
  "foundations",
  "dist",
  "foundations-index.json",
);

test("cleanHeading strips a trailing {#anchor} so the slug is unchanged", function () {
  assert.equal(
    astWalk.slugify(astWalk.cleanHeading("2. Tokens {#tokens}")),
    "tokens",
  );
  assert.equal(
    astWalk.slugify(
      astWalk.cleanHeading("3. Design Guidelines {#design-guidelines}"),
    ),
    "design-guidelines",
  );
  // No anchor → behaves exactly as before
  assert.equal(
    astWalk.slugify(astWalk.cleanHeading("1. Color Primitives")),
    "color-primitives",
  );
});

test("foundations-index.json lists the 5 referenceable sections with anchored slugs", function () {
  var idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  assert.equal(idx._schema_version, 1);
  var slugs = idx.sections
    .map(function (s) {
      return s.slug;
    })
    .sort();
  assert.deepEqual(slugs, [
    "color-primitives",
    "design-guidelines",
    "handoff-protocol",
    "related-guidelines",
    "tokens",
  ]);
  idx.sections.forEach(function (s) {
    assert.ok(
      typeof s.title === "string" && s.title.length > 0,
      "title for " + s.slug,
    );
  });
  assert.ok(slugs.indexOf("intro") === -1);
  assert.ok(slugs.indexOf("table-of-contents") === -1);
});

test("buildFoundationsIndex builds the index directly from src/ (not via dist)", function () {
  var idx = deriveFoundations.buildFoundationsIndex(SRC_DIR);
  assert.equal(idx._schema_version, 1);
  assert.equal(idx.sections.length, 5);
  var slugs = idx.sections
    .map(function (s) {
      return s.slug;
    })
    .sort();
  assert.deepEqual(slugs, [
    "color-primitives",
    "design-guidelines",
    "handoff-protocol",
    "related-guidelines",
    "tokens",
  ]);
  idx.sections.forEach(function (s) {
    assert.ok(
      typeof s.slug === "string" && s.slug.length > 0,
      "non-empty slug",
    );
    assert.ok(
      typeof s.title === "string" && s.title.length > 0,
      "non-empty title for " + s.slug,
    );
  });
  assert.ok(slugs.indexOf("intro") === -1, "intro excluded");
  assert.ok(
    slugs.indexOf("table-of-contents") === -1,
    "table-of-contents excluded",
  );
});
