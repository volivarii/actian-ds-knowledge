"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var D = require("../scripts/graph/derive-graph.js");
var M = require("../scripts/lib/graph/model.js");
var ROOT = path.join(__dirname, "..");
function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

// In-memory (no shared-dist write): the deriver attaches figmaKey/figmaNodeId
// on component nodes, sourced from the registry entry.
test("collectComponentsAndCategories: component nodes carry figmaKey + figmaNodeId from the registry", function () {
  var reg = readJSON("components/dist/registries/dskit.json");
  var g = new M.GraphBuilder();
  D.collectComponentsAndCategories(g, [reg], { overrides: {} });
  var out = g.build();
  var comps = out.nodes.filter(function (n) {
    return n.type === "component";
  });
  assert.ok(comps.length > 0);
  assert.ok(
    comps.every(function (n) {
      return (
        typeof n.figmaKey === "string" && typeof n.figmaNodeId === "string"
      );
    }),
  );
  var badge = out.nodes.find(function (n) {
    return n.id === "component:badge";
  });
  assert.equal(badge.figmaKey, reg.components.badge.key);
  assert.equal(badge.figmaNodeId, reg.components.badge.nodeId);
});

// Spec 3.1: figmaKey/figmaNodeId are carried only when present, so a future
// keyless registry entry degrades to omission (not an error). Real registries
// are 100% keyed, so this fabricated entry is the only way to exercise the
// omit branch. In-memory (no shared-dist write), isolation-safe.
test("collectComponentsAndCategories: a keyless registry entry omits figmaKey/figmaNodeId (degrades, not errors)", function () {
  var g = new M.GraphBuilder();
  D.collectComponentsAndCategories(
    g,
    [{ components: { "no-key-comp": { name: "No Key" } } }],
    { overrides: {} },
  );
  var n = g.build().nodes.find(function (x) {
    return x.id === "component:no-key-comp";
  });
  assert.equal(n.figmaKey, undefined);
  assert.equal(n.figmaNodeId, undefined);
  assert.equal(n.title, "No Key");
});

// Committed artifact: the shipped graph.json carries the key on all 613
// component nodes and on no other node type.
test("graph/dist/graph.json: 613 component nodes carry figmaKey; non-component nodes never do", function () {
  var g = readJSON("graph/dist/graph.json");
  var comps = g.nodes.filter(function (n) {
    return n.type === "component";
  });
  assert.equal(comps.length, 613);
  assert.ok(
    comps.every(function (n) {
      return (
        typeof n.figmaKey === "string" && typeof n.figmaNodeId === "string"
      );
    }),
  );
  var nonComp = g.nodes.filter(function (n) {
    return n.type !== "component";
  });
  assert.ok(
    nonComp.every(function (n) {
      return n.figmaKey === undefined && n.figmaNodeId === undefined;
    }),
  );
});

// Committed JSON-LD view carries the key on component objects, and the context
// maps the terms (queryable/addressable, not an opaque blob).
test("graph/dist/graph.jsonld carries figmaKey on component objects; context maps the terms", function () {
  var ld = readJSON("graph/dist/graph.jsonld");
  var badge = ld["@graph"].find(function (o) {
    return o["@id"] === "component:badge";
  });
  assert.equal(badge["@type"], "Component");
  assert.equal(typeof badge.figmaKey, "string");
  var ctx = readJSON("graph/context.jsonld")["@context"];
  assert.equal(ctx.figmaKey, "actian-ds:figmaComponentKey");
  assert.equal(ctx.figmaNodeId, "actian-ds:figmaNodeId");
});

// The shipped quality-report surfaces the collisions count in the documented
// 5-key metric shape.
test("graph/dist/quality-report.json reports the slug_collisions count (=22)", function () {
  var qr = readJSON("graph/dist/quality-report.json");
  var m = (Array.isArray(qr) ? qr : qr.metrics || []).find(function (x) {
    return x.metric === "slug_collisions";
  });
  assert.ok(m, "slug_collisions metric present");
  assert.equal(m.value, 22);
  assert.deepEqual(Object.keys(m).sort(), [
    "dimension",
    "metric",
    "severity",
    "timestamp",
    "value",
  ]);
});

// Slice 2b: the shipped graph carries component->component composition edges
// projected from registry nestedComponents, and they include real (non-icon)
// composites, not just component->icon nesting.
test("graph/dist/graph.json: composed_of edges are component->component, no self-loops, include non-icon composites", function () {
  var g = readJSON("graph/dist/graph.json");
  var comp = g.edges.filter(function (e) {
    return e.type === "composed_of";
  });
  assert.ok(comp.length > 0, "composed_of edges present");
  comp.forEach(function (e) {
    assert.ok(
      e.source.startsWith("component:") && e.target.startsWith("component:"),
    );
    assert.notEqual(e.source, e.target);
    assert.deepEqual(Object.keys(e).sort(), ["source", "target", "type"]);
  });
  var iconTargets = new Set(
    g.edges
      .filter(function (e) {
        return e.type === "in_category" && e.target === "category:icons";
      })
      .map(function (e) {
        return e.source;
      }),
  );
  assert.ok(
    comp.some(function (e) {
      return !iconTargets.has(e.target);
    }),
    "at least one non-icon composite present",
  );
});

// The composition_edges metric in the shipped quality-report equals the actual
// composed_of edge count in the shipped graph (freshness lock).
test("graph/dist/quality-report.json: composition_edges count matches graph.json", function () {
  var g = readJSON("graph/dist/graph.json");
  var expected = g.edges.filter(function (e) {
    return e.type === "composed_of";
  }).length;
  var qr = readJSON("graph/dist/quality-report.json");
  var m = (Array.isArray(qr) ? qr : qr.metrics || []).find(function (x) {
    return x.metric === "composition_edges";
  });
  assert.ok(m, "composition_edges metric present");
  assert.equal(m.dimension, "connectivity");
  assert.equal(m.value, expected);
});
