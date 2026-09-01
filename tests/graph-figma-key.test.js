"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var D = require("../scripts/graph/derive-graph.js");
var M = require("../scripts/lib/graph/model.js");
var C = require("./lib/committed-artifacts.js");
var readCommittedJSON = C.readCommittedJSON;
var ROOT = path.join(__dirname, "..");
// Working-tree read. Only correct where the assertion is self-contained -- an
// in-memory derive compared against the registry it was built from, or the
// registries directory listing. Anything asserting a SHIPPED artifact uses
// readCommittedJSON; see tests/lib/committed-artifacts.js for why.
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

// Committed artifact: every component node carries the Figma key, no other node
// type does, and the count stays within the order of magnitude the corpus has.
//
// The registry<->graph UNION assertion that replaced the old hand-kept count does
// NOT live here. It compares two artifacts a sync commits at different times --
// registries first, the regenerated graph after -- so inside `npm test` it fails
// on every registry-changing PR in that window, and the sibling derive workflows
// run `npm test` before their auto-commit, so it would block them from committing
// the dist they exist to produce. It runs as a validate-manifest step instead,
// after derive:graph: scripts/validate/validate-graph-registry-union.js. Same
// reasoning, and the same precedent, as the llms guard in that workflow.
//
// What remains here is cascade-independent: it reads only the graph, so it holds
// whatever state the registries are in.
test("graph/dist/graph.json: every component node carries figmaKey; non-component nodes never do", function () {
  var g = readCommittedJSON("graph/dist/graph.json");
  var comps = g.nodes.filter(function (n) {
    return n.type === "component";
  });

  // Magnitude tripwires, both sides, sized against the largest LEGITIMATE change
  // rather than today's count. They exist because classifyRegistry treats any
  // addition as additive and auto-merges it however large, and because a removal
  // upstream shrinks the registries and the graph together, so a comparison
  // between them cannot see it. dskit already carries ~145 icons, so a single
  // release importing an icon set of that size is ordinary and must not red an
  // unattended nightly -- a tighter ceiling would recreate the failure this
  // change removes, one threshold further out.
  //
  // These are the last hand-kept magnitudes here and they are the wrong shape for
  // the job; the real gap is in the classifier, tracked in #625.
  //
  // What this does NOT catch, stated explicitly rather than left implied: a
  // REMOVAL. The union compares registries to the graph, and a removal shrinks
  // both together, so dropping 200 components leaves the pair consistent, the
  // count inside these bounds, and the sidecar fresh -- where the old
  // `=== 614` failed loudly. That was the literal's main value.
  //
  // The accepted reasoning: components/dist/registries/ is dist, and
  // scripts/sync/sync-from-figma.js is its only writer (everything else in
  // scripts/ reads it), while CLAUDE.md forbids hand-editing dist. So a removal
  // arrives through a sync, and classifyRegistry pushes a breaking reason for
  // every removed entry, which opens a review-required PR instead of
  // auto-merging. The residual risk is a removal that reaches these files
  // WITHOUT a sync -- a bad merge, or a script that bypasses it -- which no gate
  // here would see. Recorded on #625 rather than answered with a tighter floor,
  // because a floor close enough to catch it would red on the legitimate
  // shrinkage this change exists to stop blocking.
  assert.ok(
    comps.length > 400 && comps.length < 1000,
    "component nodes outside the expected order of magnitude: " +
      comps.length +
      ". Below the floor, a mass removal reached the registries -- check the " +
      "sync diff before regenerating anything. Above the ceiling, either the " +
      "page filter ingested frames it should have excluded (check the sync's " +
      "excluded-pages report), or a large kit was legitimately wired in, in " +
      "which case raising this bound is the correct fix and part of that change.",
  );

  assert.ok(comps.length > 0, "component nodes present");
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
  var ld = readCommittedJSON("graph/dist/graph.jsonld");
  var badge = ld["@graph"].find(function (o) {
    return o["@id"] === "component:badge";
  });
  assert.equal(badge["@type"], "Component");
  assert.equal(typeof badge.figmaKey, "string");
  // Context from the WORKING TREE: it is a hand-authored derive INPUT, not
  // something derive() rewrites, so the race that justifies the HEAD reads above
  // does not apply. Reading it from HEAD would mean a term-mapping change is
  // unexercised here until it is committed -- a silent green.
  var ctx = readJSON("graph/context.jsonld")["@context"];
  assert.equal(ctx.figmaKey, "actian-ds:figmaComponentKey");
  assert.equal(ctx.figmaNodeId, "actian-ds:figmaNodeId");
});

// The shipped quality-report surfaces the collisions count in the documented
// 5-key metric shape, joined to the sidecar it restates rather than pinned.
//
// Be honest about how much this carries: validate-graph.js COMPUTES the metric
// by reading collisions.json and taking .length, so the two can only disagree if
// the committed dist is stale -- which validate-manifest already fails on, hard,
// by re-deriving and diffing. Treat this as a shape-and-presence check, not as
// magnitude coverage. The bounds on the collision count itself live with the
// detection, in graph-collisions.test.js.
test("graph/dist/quality-report.json: slug_collisions matches the committed collisions sidecar", function () {
  var qr = readCommittedJSON("graph/dist/quality-report.json");
  var m = (Array.isArray(qr) ? qr : qr.metrics || []).find(function (x) {
    return x.metric === "slug_collisions";
  });
  assert.ok(m, "slug_collisions metric present");
  var committed = readCommittedJSON(
    "graph/dist/collisions.json",
  ).slug_collisions;
  assert.ok(committed.length > 0, "collisions sidecar is populated");
  assert.equal(m.value, committed.length);
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
  var g = readCommittedJSON("graph/dist/graph.json");
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
  var g = readCommittedJSON("graph/dist/graph.json");
  var expected = g.edges.filter(function (e) {
    return e.type === "composed_of";
  }).length;
  var qr = readCommittedJSON("graph/dist/quality-report.json");
  var m = (Array.isArray(qr) ? qr : qr.metrics || []).find(function (x) {
    return x.metric === "composition_edges";
  });
  assert.ok(m, "composition_edges metric present");
  assert.equal(m.dimension, "connectivity");
  assert.equal(m.value, expected);
});

// Bridge: the shipped graph carries authored ux_pattern -> component edges.
test("graph/dist/graph.json: uses_component edges are ux_pattern->component, asserted, with provenance", function () {
  var g = readCommittedJSON("graph/dist/graph.json");
  var u = g.edges.filter(function (e) {
    return e.type === "uses_component";
  });
  assert.ok(u.length > 0, "uses_component edges present");
  u.forEach(function (e) {
    assert.ok(e.source.startsWith("pattern:"));
    assert.ok(e.target.startsWith("component:"));
    assert.equal(e.confidence, "asserted");
    assert.equal(e.provenance.method, "patterns.components");
  });
  assert.ok(
    u.some(function (e) {
      return (
        e.source === "pattern:search-filtered-table" &&
        e.target === "component:table"
      );
    }),
    "known mapping present",
  );
});

test("graph/dist/quality-report.json: pattern_component_edges matches graph.json", function () {
  var g = readCommittedJSON("graph/dist/graph.json");
  var expected = g.edges.filter(function (e) {
    return e.type === "uses_component";
  }).length;
  var qr = readCommittedJSON("graph/dist/quality-report.json");
  var m = (Array.isArray(qr) ? qr : qr.metrics || []).find(function (x) {
    return x.metric === "pattern_component_edges";
  });
  assert.ok(m, "pattern_component_edges metric present");
  assert.equal(m.dimension, "connectivity");
  assert.equal(m.value, expected);
});
