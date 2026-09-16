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

// The edge-type list is written TWICE by hand: once in graph/vocabulary.json and
// once as an enum in schemas/graph.json. Nothing compared them, and on 2026-09-07
// the shown_in edge was added to the vocabulary and not the schema. Every local
// gate stayed green, because `npm test` does not schema-validate the graph; CI
// does, and both required checks went red on 39 identical
// "/edges/N/type must be equal to one of the allowed values" lines.
//
// This is the repo's most-repeated failure in miniature, one fact restated in two
// places with nothing joining them. Deleting one copy is the better fix and is
// not available here: the vocabulary carries endpoint constraints the JSON Schema
// enum cannot express, and the enum is what validate-graph enforces. So the two
// stay, and this asserts they agree.
test("vocabulary edgeTypes and the graph schema's enum are the same set", function () {
  var schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, "schemas", "graph.json"), "utf8"),
  );
  // Find the edge `type` enum wherever it sits, rather than pinning a path that
  // a schema reshuffle would silently break into "found nothing, all clear".
  var found = null;
  (function walk(node) {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node.enum) && node.enum.indexOf("uses_component") !== -1) {
      found = node.enum;
      return;
    }
    Object.keys(node).forEach(function (k) {
      walk(node[k]);
    });
  })(schema);
  assert.ok(
    found,
    "no edge-type enum found in schemas/graph.json, so this comparison had no " +
      "subject. The schema was reshaped; re-point this before trusting it.",
  );

  assert.deepEqual(
    found.slice().sort(),
    Object.keys(vocab.edgeTypes).sort(),
    "graph/vocabulary.json and schemas/graph.json disagree about which edge " +
      "types exist. Adding an edge type means adding it to BOTH; the schema is " +
      "what validate:graph enforces and it is not run by `npm test`.",
  );
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
    "persona",
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
