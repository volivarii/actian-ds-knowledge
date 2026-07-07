"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var M = require("../scripts/lib/graph/model.js");
var ROOT = path.join(__dirname, "..");
var vocab = JSON.parse(
  fs.readFileSync(path.join(ROOT, "graph", "vocabulary.json"), "utf8"),
);

test("vocabulary: nodeTypes match model.PREFIX exactly (keys + prefixes)", function () {
  assert.deepEqual(
    Object.keys(vocab.nodeTypes).sort(),
    Object.keys(M.PREFIX).sort(),
  );
  Object.keys(M.PREFIX).forEach(function (t) {
    assert.equal(
      vocab.nodeTypes[t].prefix,
      M.PREFIX[t],
      "prefix mismatch: " + t,
    );
  });
});

test("vocabulary: every edge type used in the derived graph is declared", function () {
  var graph = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph", "dist", "graph.json"), "utf8"),
  );
  var used = Array.from(
    new Set(
      graph.edges.map(function (e) {
        return e.type;
      }),
    ),
  );
  used.forEach(function (t) {
    assert.ok(
      vocab.edgeTypes[t],
      "graph uses edge type '" + t + "' absent from vocabulary",
    );
  });
});

test("vocabulary: every edge type references known node types", function () {
  Object.keys(vocab.edgeTypes).forEach(function (et) {
    var spec = vocab.edgeTypes[et];
    spec.source.concat(spec.target).forEach(function (nt) {
      assert.ok(
        vocab.nodeTypes[nt],
        "edge '" + et + "' references unknown node type '" + nt + "'",
      );
    });
  });
});

test("vocabulary: app-context edge types have the correct endpoint constraints", function () {
  // Copy before sort: never mutate the shared module-scoped vocab fixture.
  assert.deepEqual([...vocab.edgeTypes.in_app.source].sort(), [
    "app_entity",
    "ux_pattern",
  ]);
  assert.deepEqual(vocab.edgeTypes.in_app.target, ["app"]);
  assert.deepEqual(vocab.edgeTypes.entity_related.source, ["app_entity"]);
  assert.deepEqual(vocab.edgeTypes.entity_related.target, ["app_entity"]);
  assert.deepEqual(vocab.edgeTypes.term_about.source, ["terminology_term"]);
  assert.deepEqual([...vocab.edgeTypes.term_about.target].sort(), [
    "app",
    "app_entity",
    "ux_pattern",
  ]);
});
