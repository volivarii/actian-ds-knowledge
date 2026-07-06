"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var fs = require("fs");
var path = require("path");
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");
var ROOT = path.resolve(__dirname, "..");

var schema = JSON.parse(
  fs.readFileSync(path.join(ROOT, "schemas/graph-jsonld.json"), "utf8"),
);
var ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
var validate = ajv.compile(schema);

test("the emitted graph.jsonld validates against the schema", function () {
  var ld = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.jsonld"), "utf8"),
  );
  var ok = validate(ld);
  assert.ok(ok, JSON.stringify(validate.errors, null, 2));
});

test("a node missing @type fails", function () {
  var bad = { "@context": {}, _meta: {}, "@graph": [{ "@id": "component:x" }] };
  assert.strictEqual(validate(bad), false);
});

test("an edge missing target fails", function () {
  var bad = {
    "@context": {},
    _meta: {},
    "@graph": [
      { "@type": "Edge", edgeType: "in_category", source: "component:x" },
    ],
  };
  assert.strictEqual(validate(bad), false);
});
