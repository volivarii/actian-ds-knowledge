"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var { toJsonLd } = require("../scripts/lib/graph/to-jsonld.js");

var CTX = { "@context": { component: "x" } };
var GRAPH = {
  _schema_version: 2,
  _meta: {
    auto_generated: true,
    generator: "scripts/graph/derive-graph.js",
    do_not_edit: "x",
  },
  nodes: [
    { id: "component:badge", type: "component", title: "Badges" },
    {
      id: "a11y:icons",
      type: "a11y_criterion",
      title: "Icons",
      wcag: ["1.4.11", "1.1.1"],
    },
  ],
  edges: [
    {
      source: "component:badge",
      target: "category:data-display",
      type: "in_category",
    },
    {
      source: "category:action",
      target: "a11y:icons",
      type: "a11y_ref",
      scope: "category",
      confidence: "asserted",
      provenance: {
        source_file: "x.md",
        deriver: "derive-graph.js",
        method: "m",
      },
      note: "n",
    },
  ],
};

test("wraps context + _meta and emits one @graph entry per node and per edge", function () {
  var ld = toJsonLd(GRAPH, CTX);
  assert.deepStrictEqual(ld["@context"], CTX["@context"]);
  assert.deepStrictEqual(ld._meta, GRAPH._meta);
  assert.strictEqual(ld._schema_version, GRAPH._schema_version);
  assert.strictEqual(
    ld["@graph"].length,
    GRAPH.nodes.length + GRAPH.edges.length,
  );
});

test("nodes become @id + @type, losslessly carrying every other field", function () {
  var ld = toJsonLd(GRAPH, CTX);
  var badge = ld["@graph"].find(function (o) {
    return o["@id"] === "component:badge";
  });
  assert.strictEqual(badge["@type"], "Component");
  assert.strictEqual(badge.title, "Badges");
  var icons = ld["@graph"].find(function (o) {
    return o["@id"] === "a11y:icons";
  });
  assert.strictEqual(icons["@type"], "A11yCriterion");
  assert.deepStrictEqual(icons.wcag, ["1.4.11", "1.1.1"]);
  // no leftover "id"/"type" keys
  assert.ok(!("id" in badge) && !("type" in badge));
});

test("edges are reified losslessly (type -> edgeType, all fields kept)", function () {
  var ld = toJsonLd(GRAPH, CTX);
  var edges = ld["@graph"].filter(function (o) {
    return o["@type"] === "Edge";
  });
  assert.strictEqual(edges.length, 2);
  var a11y = edges.find(function (e) {
    return e.edgeType === "a11y_ref";
  });
  assert.strictEqual(a11y.source, "category:action");
  assert.strictEqual(a11y.target, "a11y:icons");
  assert.strictEqual(a11y.scope, "category");
  assert.strictEqual(a11y.confidence, "asserted");
  assert.deepStrictEqual(a11y.provenance, {
    source_file: "x.md",
    deriver: "derive-graph.js",
    method: "m",
  });
  assert.strictEqual(a11y.note, "n");
  assert.ok(!("type" in a11y)); // renamed to edgeType
});

test("total losslessness: no source field value is dropped", function () {
  var ld = toJsonLd(GRAPH, CTX);
  var g = ld["@graph"];
  // every node field (except id/type) survives; every edge field (except type/source/target) survives
  GRAPH.nodes.forEach(function (n) {
    var o = g.find(function (x) {
      return x["@id"] === n.id;
    });
    Object.keys(n).forEach(function (k) {
      if (k !== "id" && k !== "type")
        assert.deepStrictEqual(o[k], n[k], "node field " + k);
    });
  });
  // symmetric check for edges: order is preserved (edges follow nodes), so the
  // i-th Edge object corresponds to GRAPH.edges[i]. type -> edgeType; every
  // other edge field (source/target included) survives under the same name.
  var ldEdges = g.filter(function (x) {
    return x["@type"] === "Edge";
  });
  GRAPH.edges.forEach(function (e, i) {
    var o = ldEdges[i];
    Object.keys(e).forEach(function (k) {
      if (k === "type")
        assert.strictEqual(o.edgeType, e.type, "edge type -> edgeType");
      else assert.deepStrictEqual(o[k], e[k], "edge field " + k);
    });
  });
});

test("throws on an unknown node type", function () {
  assert.throws(function () {
    toJsonLd(
      {
        _meta: {},
        nodes: [{ id: "x:y", type: "bogus", title: "t" }],
        edges: [],
      },
      CTX,
    );
  }, /unknown node type/);
});

test("throws when nodes/edges are not arrays", function () {
  assert.throws(function () {
    toJsonLd({ _meta: {} }, CTX);
  }, /nodes\[\] and edges\[\]/);
});
