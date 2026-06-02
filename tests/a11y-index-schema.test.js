"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");

function compile() {
  var schema = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "..", "schemas", "a11y-index.json"),
      "utf8",
    ),
  );
  var ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

var CC = {
  slug: "color-contrast",
  title: "2. Color & Contrast",
  tier: "foundation",
  wcag: ["1.4.1"],
  body_excerpt: "...",
};
var PR = {
  slug: "principles",
  title: "1. Principles",
  tier: "header",
  wcag: [],
};
var GOOD = {
  _schema_version: 1,
  _meta: { auto_generated: true, source: "accessibility/src/" },
  sections: [CC, PR],
  bySlug: { "color-contrast": CC, principles: PR },
};

test("a11y-index schema accepts a valid index", function () {
  var validate = compile();
  assert.ok(validate(GOOD), JSON.stringify(validate.errors));
});

test("a11y-index schema rejects a section missing slug", function () {
  var validate = compile();
  var bad = JSON.parse(JSON.stringify(GOOD));
  delete bad.sections[0].slug;
  assert.ok(!validate(bad), "expected rejection for missing slug");
});

test("a11y-index schema rejects a section with non-array wcag", function () {
  var validate = compile();
  var bad = JSON.parse(JSON.stringify(GOOD));
  bad.sections[0].wcag = "1.4.1";
  assert.ok(!validate(bad), "expected rejection for non-array wcag");
});

test("a11y-index schema requires bySlug", function () {
  var validate = compile();
  var bad = JSON.parse(JSON.stringify(GOOD));
  delete bad.bySlug;
  assert.ok(!validate(bad), "expected rejection for missing bySlug");
});

test("a11y-index schema validates bySlug entries (must be section-shaped)", function () {
  var validate = compile();
  var bad = JSON.parse(JSON.stringify(GOOD));
  delete bad.bySlug["color-contrast"].slug;
  assert.ok(!validate(bad), "expected rejection for malformed bySlug entry");
});
