"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var Ajv = require("ajv/dist/2020");
var D = require("../scripts/graph/derive-graph.js");
var ROOT = path.join(__dirname, "..");

test("detectSlugCollisions: 22 cross-registry collisions with distinct keys", function () {
  var kits = ["dskit", "fmkit", "metakit"].map(function (k) {
    return { kit: k, reg: JSON.parse(fs.readFileSync(path.join(ROOT, "components/dist/registries/" + k + ".json"), "utf8")) };
  });
  var out = D.detectSlugCollisions(kits);
  assert.equal(out.slug_collisions.length, 22);
  out.slug_collisions.forEach(function (c) {
    assert.ok(c.candidates.length >= 2);
    assert.ok(new Set(c.candidates.map(function (x) { return x.key; })).size > 1);
    assert.equal(typeof c.resolved_to, "string");
  });
  var ad = out.slug_collisions.find(function (c) { return c.slug === "arrow-down"; });
  assert.ok(ad && ad.candidates.some(function (x) { return x.kit === "dskit"; }) && ad.candidates.some(function (x) { return x.kit === "fmkit"; }));
});

test("derive(): writes graph/dist/collisions.json with 22 entries + _meta", function () {
  D.derive();
  var col = JSON.parse(fs.readFileSync(path.join(ROOT, "graph/dist/collisions.json"), "utf8"));
  assert.equal(col._meta.auto_generated, true);
  assert.equal(col.slug_collisions.length, 22);
});

test("emitted collisions.json validates against schemas/collisions.json", function () {
  D.derive();
  var schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas/collisions.json"), "utf8"));
  var validate = new (Ajv.default || Ajv)({ strict: false }).compile(schema);
  var col = JSON.parse(fs.readFileSync(path.join(ROOT, "graph/dist/collisions.json"), "utf8"));
  assert.ok(validate(col), JSON.stringify(validate.errors));
});
