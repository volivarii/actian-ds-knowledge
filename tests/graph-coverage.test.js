"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var C = require("../scripts/graph/coverage.js");

test("coverageFromAuthored: authored > emitted yields ratio < 1", function () {
  var authored = {
    a11y_ref: new Set([
      "component:button|a11y:contrast",
      "component:button|a11y:focus-keyboard",
    ]),
    foundations_ref: new Set(),
    motion_ref: new Set(),
  };
  var graph = {
    nodes: [],
    edges: [
      { source: "component:button", target: "a11y:contrast", type: "a11y_ref" },
    ],
  };
  var c = C.coverageFromAuthored(authored, graph);
  assert.equal(c.byKind.a11y_ref.authored, 2);
  assert.equal(c.byKind.a11y_ref.emitted, 1);
  assert.equal(c.byKind.a11y_ref.ratio, 0.5);
  assert.equal(c.overall.ratio, 0.5);
});

test("coverageFromAuthored: zero authored yields ratio 1 (no division by zero)", function () {
  var c = C.coverageFromAuthored(
    { a11y_ref: new Set(), foundations_ref: new Set(), motion_ref: new Set() },
    { nodes: [], edges: [] },
  );
  assert.equal(c.byKind.a11y_ref.ratio, 1);
  assert.equal(c.overall.ratio, 1);
});

test("computeCoverage: real substrate has full coverage (every authored ref emitted)", function () {
  var root = path.join(__dirname, "..");
  var graph = JSON.parse(
    fs.readFileSync(path.join(root, "graph", "dist", "graph.json"), "utf8"),
  );
  var c = C.computeCoverage(root, graph);
  C.EDGE_KINDS.forEach(function (k) {
    assert.equal(c.byKind[k].ratio, 1, k + " coverage must be 1.0");
  });
  assert.equal(c.overall.ratio, 1);
});

test("authored-location canary: every kind has > 0 authored refs in the real substrate", function () {
  var root = path.join(__dirname, "..");
  var graph = JSON.parse(
    fs.readFileSync(path.join(root, "graph", "dist", "graph.json"), "utf8"),
  );
  var nodeIds = new Set(
    graph.nodes.map(function (n) {
      return n.id;
    }),
  );
  var authored = C.readAuthored(root, nodeIds);
  assert.ok(
    C.EDGE_KINDS.length > 0,
    "EDGE_KINDS is empty — canary would pass vacuously",
  );
  C.EDGE_KINDS.forEach(function (k) {
    assert.ok(
      authored[k].size > 0,
      "no authored " +
        k +
        " refs found — has the authoring location moved? coverage would falsely read 1.0",
    );
  });
});
