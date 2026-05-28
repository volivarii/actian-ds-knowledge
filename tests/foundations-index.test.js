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

test("foundations-index.json lists the 3 referenceable sections with anchored slugs", function () {
  var idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  assert.equal(idx._schema_version, 1);
  var slugs = idx.sections
    .map(function (s) {
      return s.slug;
    })
    .sort();
  assert.deepEqual(slugs, ["color-primitives", "design-guidelines", "tokens"]);
  idx.sections.forEach(function (s) {
    assert.ok(
      typeof s.title === "string" && s.title.length > 0,
      "title for " + s.slug,
    );
  });
  assert.ok(slugs.indexOf("intro") === -1);
  assert.ok(slugs.indexOf("table-of-contents") === -1);
  // SKIP_H2_SLUGS sections are emitted to no dist file, so they must not be
  // advertised as referenceable in the flat index.
  assert.ok(slugs.indexOf("handoff-protocol") === -1);
  assert.ok(slugs.indexOf("related-guidelines") === -1);
});

test("buildFoundationsIndex builds the index directly from src/ (not via dist)", function () {
  var idx = deriveFoundations.buildFoundationsIndex(SRC_DIR);
  assert.equal(idx._schema_version, 1);
  assert.equal(idx.sections.length, 3);
  var slugs = idx.sections
    .map(function (s) {
      return s.slug;
    })
    .sort();
  assert.deepEqual(slugs, ["color-primitives", "design-guidelines", "tokens"]);
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
  assert.ok(
    slugs.indexOf("handoff-protocol") === -1,
    "handoff-protocol excluded (SKIP_H2_SLUGS)",
  );
  assert.ok(
    slugs.indexOf("related-guidelines") === -1,
    "related-guidelines excluded (SKIP_H2_SLUGS)",
  );
});

test("foundations H2 {#anchor} literals match the derived slug (no silent divergence)", function () {
  var SRC = path.join(REPO_ROOT, "foundations", "src");
  var files = fs.readdirSync(SRC).filter(function (f) {
    return f.endsWith(".md") && f !== "AUTHORING.md";
  });
  var checked = 0;
  files.forEach(function (f) {
    var body = fs.readFileSync(path.join(SRC, f), "utf-8");
    body.split("\n").forEach(function (line) {
      var m = /^##\s+(.+?)\s*\{#([a-z0-9-]+)\}\s*$/.exec(line);
      if (!m) return;
      var derived = astWalk.slugify(astWalk.cleanHeading(m[1]));
      assert.equal(
        derived,
        m[2],
        "anchor/slug mismatch in " +
          f +
          ": '" +
          line +
          "' → anchor '" +
          m[2] +
          "' vs derived '" +
          derived +
          "'",
      );
      checked++;
    });
  });
  assert.ok(
    checked >= 5,
    "expected to check at least the 5 anchored foundations H2 headings, checked " +
      checked,
  );
});
