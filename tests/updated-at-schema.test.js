"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var fs = require("fs");
var Ajv = require("ajv/dist/2020");
var addFormats = require("ajv-formats");

var schemaPath = path.resolve(
  __dirname,
  "..",
  "schemas",
  "guideline-component.json",
);
var schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

function makeValidator() {
  var ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function baseDoc() {
  return {
    _schema_version: 1,
    _meta: {
      auto_generated: true,
      source: "components/src/button/",
      do_not_edit: "Edit per-domain sources.",
    },
    slug: "button",
    component: "Button",
    meta: { category: "action" },
    domains: {},
  };
}

test("schema accepts optional updated_at ISO date-time", function () {
  var validate = makeValidator();
  var doc = baseDoc();
  doc.updated_at = "2026-05-12T14:33:22+00:00";
  assert.equal(validate(doc), true, JSON.stringify(validate.errors));
});

test("schema rejects malformed updated_at", function () {
  var validate = makeValidator();
  var doc = baseDoc();
  doc.updated_at = "not-a-date";
  assert.equal(validate(doc), false);
});

test("schema accepts doc with no updated_at", function () {
  var validate = makeValidator();
  assert.equal(validate(baseDoc()), true, JSON.stringify(validate.errors));
});
