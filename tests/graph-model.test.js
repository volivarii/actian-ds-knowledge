"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var Ajv = require("ajv/dist/2020");
var M = require("../scripts/lib/graph/model.js");

test("slugify normalizes labels (incl. punctuation) to dash-separated slugs", function () {
  assert.equal(M.slugify("Form (input & selection)"), "form-input-selection");
  assert.equal(M.slugify("Data Display"), "data-display");
  assert.equal(
    M.slugify("Breakpoint, grid & structure"),
    "breakpoint-grid-structure",
  );
});

test("nodeId namespaces by type so cross-domain slugs don't collide", function () {
  assert.equal(
    M.nodeId("a11y_criterion", "color-contrast"),
    "a11y:color-contrast",
  );
  assert.equal(
    M.nodeId("foundation_section", "color-contrast"),
    "foundation:color-contrast",
  );
  assert.notEqual(
    M.nodeId("a11y_criterion", "color-contrast"),
    M.nodeId("foundation_section", "color-contrast"),
  );
});

test("GraphBuilder dedups nodes by id and sorts deterministically", function () {
  var g = new M.GraphBuilder();
  g.addNode({ id: "component:b", type: "component", title: "B" });
  g.addNode({ id: "component:a", type: "component", title: "A" });
  g.addNode({ id: "component:b", type: "component", title: "B" }); // dup → ignored
  g.addEdge({ source: "component:a", target: "component:b", type: "related" });
  g.addEdge({
    source: "component:a",
    target: "category:x",
    type: "in_category",
  });
  var out = g.build();
  assert.deepEqual(
    out.nodes.map(function (n) {
      return n.id;
    }),
    ["component:a", "component:b"],
  );
  assert.deepEqual(
    out.edges.map(function (e) {
      return e.type;
    }),
    ["in_category", "related"],
  );
  assert.equal(out._schema_version, 1);
});

test("schemas/graph.json validates a well-formed graph and rejects a malformed one", function () {
  var schema = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "schemas", "graph.json"),
      "utf8",
    ),
  );
  var validate = new Ajv({ allErrors: true }).compile(schema);
  var good = {
    _schema_version: 1,
    _meta: { auto_generated: true, generator: "x", do_not_edit: "y" },
    nodes: [{ id: "a11y:x", type: "a11y_criterion", title: "X" }],
    edges: [{ source: "category:c", target: "a11y:x", type: "a11y_ref" }],
  };
  assert.ok(validate(good), JSON.stringify(validate.errors));
  var bad = {
    _schema_version: 1,
    _meta: { auto_generated: true, generator: "x", do_not_edit: "y" },
    nodes: [{ id: "a11y:x", type: "BOGUS", title: "X" }],
    edges: [],
  };
  assert.ok(!validate(bad));
});

test("nodeId throws on an unknown node type", function () {
  assert.throws(function () {
    M.nodeId("bogus", "x");
  }, /unknown node type/);
});
test("nodeId throws on an empty slug", function () {
  assert.throws(function () {
    M.nodeId("component", "");
  }, /non-empty slug/);
});
test("slugify collapses all-punctuation/empty input to empty string", function () {
  assert.equal(M.slugify(""), "");
  assert.equal(M.slugify("  & ()  "), "");
});

test("GraphBuilder dedups identical edges (type+source+target), first-wins", function () {
  var g = new M.GraphBuilder();
  g.addEdge({
    source: "category:x",
    target: "a11y:y",
    type: "a11y_ref",
    note: "first",
  });
  g.addEdge({
    source: "category:x",
    target: "a11y:y",
    type: "a11y_ref",
    note: "second",
  });
  var out = g.build();
  assert.equal(out.edges.length, 1);
  assert.equal(out.edges[0].note, "first");
});
