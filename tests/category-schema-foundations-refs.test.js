"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
// MATCH derive-categories.js exactly:
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");

var REPO_ROOT = path.resolve(__dirname, "..");
var schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "schemas", "category-defaults.json"), "utf-8"));
var ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
var validate = ajv.compile(schema);

function baseValidCategory(extra) {
  // Must satisfy the schema's root `required`. Mirrors components/src/categories/action.md.
  // anatomy minItems:2, variants minItems:1, a11y_refs minItems:3, confidence requires
  // anatomy/variants/motion/a11y, _schema_version const 2.
  var base = {
    _schema_version: 2,
    slug: "action",
    label: "Action",
    authoring_status: "engineer-seed",
    confidence: { anatomy: "medium", variants: "high", motion: "high", a11y: "high" },
    last_reviewed: "2026-05-12",
    anatomy: [
      { name: "Container", description: "the interactive surface" },
      { name: "Label", description: "action verb in title case" },
    ],
    variants: [{ axis: "Style", values: ["primary", "secondary"] }],
    motion_refs: [{ ref: "state-transitions" }],
    a11y_refs: [{ ref: "focus-keyboard" }, { ref: "color-contrast" }, { ref: "aria-labels" }],
  };
  return Object.assign(base, extra || {});
}

test("base fixture is valid (sanity)", function () {
  assert.ok(validate(baseValidCategory()), JSON.stringify(validate.errors));
});
test("schema accepts a category with valid foundations_refs", function () {
  assert.ok(validate(baseValidCategory({ foundations_refs: [{ ref: "tokens", note: "n" }] })), JSON.stringify(validate.errors));
});
test("schema rejects a foundations_refs ref with a bad slug pattern", function () {
  assert.ok(!validate(baseValidCategory({ foundations_refs: [{ ref: "Tokens!" }] })));
});
test("foundations_refs is optional (absent is valid)", function () {
  assert.ok(validate(baseValidCategory()), JSON.stringify(validate.errors));
});
