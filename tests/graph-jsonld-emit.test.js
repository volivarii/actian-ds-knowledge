"use strict";
var { test, before } = require("node:test");
var assert = require("node:assert");
var fs = require("fs");
var path = require("path");
var ROOT = path.resolve(__dirname, "..");
var { derive } = require("../scripts/graph/derive-graph.js");

before(function () {
  derive();
}); // regenerate both dist files from current substrate

test("derive writes graph/dist/graph.jsonld beside graph.json", function () {
  assert.ok(fs.existsSync(path.join(ROOT, "graph/dist/graph.jsonld")));
});

test("graph.jsonld is valid JSON-LD with @context, _meta stamp, and @graph", function () {
  var ld = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.jsonld"), "utf8"),
  );
  assert.ok(ld["@context"] && typeof ld["@context"] === "object");
  assert.strictEqual(ld._meta.auto_generated, true);
  assert.ok(Array.isArray(ld["@graph"]));
});

test("graph.jsonld carries _schema_version from graph.json (self-describing)", function () {
  var g = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.json"), "utf8"),
  );
  var ld = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.jsonld"), "utf8"),
  );
  assert.strictEqual(ld._schema_version, g._schema_version);
});

test("graph.jsonld is lossless vs graph.json (one @graph entry per node + edge)", function () {
  var g = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.json"), "utf8"),
  );
  var ld = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.jsonld"), "utf8"),
  );
  assert.strictEqual(ld["@graph"].length, g.nodes.length + g.edges.length);
  // every node id is present as an @id
  var ids = new Set(
    ld["@graph"]
      .filter(function (o) {
        return o["@id"];
      })
      .map(function (o) {
        return o["@id"];
      }),
  );
  g.nodes.forEach(function (n) {
    assert.ok(ids.has(n.id), "missing node " + n.id);
  });
});
