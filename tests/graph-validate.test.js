"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var V = require("../scripts/graph/validate-graph.js");

var base = {
  nodes: [
    { id: "component:button", type: "component", title: "Button" },
    { id: "category:action", type: "category", title: "Action" },
    {
      id: "a11y:focus-keyboard",
      type: "a11y_criterion",
      title: "Focus & Keyboard",
    },
  ],
  edges: [
    {
      source: "component:button",
      target: "category:action",
      type: "in_category",
    },
    {
      source: "category:action",
      target: "a11y:focus-keyboard",
      type: "a11y_ref",
    },
  ],
};

test("analyze: clean graph has no dangling refs", function () {
  var r = V.analyze(base);
  assert.equal(r.dangling.length, 0);
});
test("analyze: detects a dangling edge (missing target)", function () {
  var g = {
    nodes: base.nodes,
    edges: base.edges.concat([
      { source: "category:action", target: "a11y:ghost", type: "a11y_ref" },
    ]),
  };
  var r = V.analyze(g);
  assert.equal(r.dangling.length, 1);
  assert.match(r.dangling[0], /a11y:ghost/);
});
test("analyze: detects a dangling edge (missing source)", function () {
  var g = {
    nodes: base.nodes,
    edges: base.edges.concat([
      {
        source: "component:ghost",
        target: "category:action",
        type: "in_category",
      },
    ]),
  };
  var r = V.analyze(g);
  assert.equal(r.dangling.length, 1);
  assert.match(r.dangling[0], /component:ghost/);
});
test("analyze: reports a category with no a11y_ref (advisory, not dangling)", function () {
  var g = {
    nodes: base.nodes.concat([
      { id: "category:icons", type: "category", title: "Icons" },
    ]),
    edges: base.edges,
  };
  var r = V.analyze(g);
  assert.ok(r.coverage.categoriesWithoutA11y.includes("category:icons"));
  assert.equal(r.dangling.length, 0);
});
test("schemaErrors: accepts _schema_version 2", function () {
  var V = require("../scripts/graph/validate-graph.js");
  var graph = {
    _schema_version: 2,
    _meta: {
      auto_generated: true,
      generator: "scripts/graph/derive-graph.js",
      do_not_edit: "x",
    },
    nodes: [{ id: "component:button", type: "component", title: "Button" }],
    edges: [],
  };
  assert.deepEqual(V.schemaErrors(graph), []);
});

test("schemaErrors: accepts structured edge fields; rejects bad confidence enum", function () {
  var V = require("../scripts/graph/validate-graph.js");
  var base = {
    _schema_version: 2,
    _meta: { auto_generated: true, generator: "x", do_not_edit: "x" },
    nodes: [
      { id: "category:action", type: "category", title: "Action" },
      { id: "a11y:focus-keyboard", type: "a11y_criterion", title: "Focus" },
    ],
  };
  var good = Object.assign({}, base, {
    edges: [
      {
        source: "category:action",
        target: "a11y:focus-keyboard",
        type: "a11y_ref",
        scope: "category",
        confidence: "asserted",
        provenance: {
          source_file: "x",
          deriver: "derive-graph.js",
          method: "a11y_refs.requirementRefs",
        },
      },
    ],
  });
  assert.deepEqual(V.schemaErrors(good), []);
  var bad = Object.assign({}, base, {
    edges: [
      {
        source: "category:action",
        target: "a11y:focus-keyboard",
        type: "a11y_ref",
        confidence: "maybe",
      },
    ],
  });
  assert.ok(
    V.schemaErrors(bad).length > 0,
    "bad confidence enum must be rejected",
  );
});

test("schemaErrors: valid graph yields no errors; malformed node type is caught", function () {
  assert.deepEqual(
    V.schemaErrors({
      _schema_version: 1,
      _meta: { auto_generated: true, generator: "x", do_not_edit: "y" },
      nodes: [{ id: "a11y:x", type: "a11y_criterion", title: "X" }],
      edges: [],
    }),
    [],
  );
  var errs = V.schemaErrors({
    _schema_version: 1,
    _meta: { auto_generated: true, generator: "x", do_not_edit: "y" },
    nodes: [{ id: "a11y:x", type: "BOGUS", title: "X" }],
    edges: [],
  });
  assert.ok(errs.length > 0);
});
