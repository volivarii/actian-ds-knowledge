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

test("analyze: flags an edge whose endpoints violate the vocabulary", function () {
  var vocab = {
    edgeTypes: { in_category: { source: ["component"], target: ["category"] } },
  };
  var graph = {
    nodes: [
      { id: "component:button", type: "component", title: "B" },
      { id: "a11y:contrast", type: "a11y_criterion", title: "C" },
    ],
    edges: [
      {
        source: "component:button",
        target: "a11y:contrast",
        type: "in_category",
      },
    ],
  };
  var r = V.analyze(graph, vocab);
  assert.ok(
    r.typeViolations.some(function (v) {
      return /in_category target/.test(v);
    }),
    "wrong target type must be flagged",
  );
});

test("analyze: clean graph → no type violations; absent vocabulary skips the check", function () {
  var vocab = {
    edgeTypes: { in_category: { source: ["component"], target: ["category"] } },
  };
  var graph = {
    nodes: [
      { id: "component:button", type: "component", title: "B" },
      { id: "category:action", type: "category", title: "A" },
    ],
    edges: [
      {
        source: "component:button",
        target: "category:action",
        type: "in_category",
      },
    ],
  };
  assert.deepEqual(V.analyze(graph, vocab).typeViolations, []);
  assert.deepEqual(V.analyze(graph).typeViolations, []);
});

test("analyze: an undeclared edge type is flagged against the vocabulary", function () {
  var vocab = {
    edgeTypes: { in_category: { source: ["component"], target: ["category"] } },
  };
  var graph = {
    nodes: [
      { id: "component:x", type: "component", title: "x" },
      { id: "category:y", type: "category", title: "y" },
    ],
    edges: [{ source: "component:x", target: "category:y", type: "mystery" }],
  };
  assert.ok(
    V.analyze(graph, vocab).typeViolations.some(function (v) {
      return /not in the vocabulary/.test(v);
    }),
  );
});

test("real graph conforms to the real vocabulary (zero type violations)", function () {
  var fs = require("node:fs"),
    path = require("node:path");
  var root = path.join(__dirname, "..");
  var graph = JSON.parse(
    fs.readFileSync(path.join(root, "graph", "dist", "graph.json"), "utf8"),
  );
  var vocab = JSON.parse(
    fs.readFileSync(path.join(root, "graph", "vocabulary.json"), "utf8"),
  );
  assert.deepEqual(V.analyze(graph, vocab).typeViolations, []);
});

test("buildQualityReport: every entry has the documented 5-key shape with null timestamp", function () {
  var analysis = {
    dangling: [],
    typeViolations: [],
    coverage: {
      categoriesWithoutA11y: ["category:x"],
      criteriaUnreferenced: [],
      componentsWithoutCategory: [],
    },
    orphans: ["component:y"],
  };
  var coverage = {
    byKind: {
      a11y_ref: { authored: 2, emitted: 2, ratio: 1 },
      foundations_ref: { authored: 0, emitted: 0, ratio: 1 },
      motion_ref: { authored: 0, emitted: 0, ratio: 1 },
    },
    overall: { authored: 2, emitted: 2, ratio: 1 },
  };
  var report = V.buildQualityReport(analysis, coverage, 0);
  assert.ok(report.length >= 8);
  report.forEach(function (e) {
    assert.deepEqual(Object.keys(e).sort(), [
      "dimension",
      "metric",
      "severity",
      "timestamp",
      "value",
    ]);
    assert.equal(e.timestamp, null);
  });
  assert.ok(
    report.some(function (e) {
      return (
        e.dimension === "coverage" &&
        e.metric === "overall" &&
        e.severity === "info"
      );
    }),
  );
});

test("buildQualityReport: coverage below threshold is a warning; dangling is a violation", function () {
  var analysis = {
    dangling: ["x"],
    typeViolations: [],
    coverage: {
      categoriesWithoutA11y: [],
      criteriaUnreferenced: [],
      componentsWithoutCategory: [],
    },
    orphans: [],
  };
  var coverage = {
    byKind: {
      a11y_ref: { authored: 10, emitted: 5, ratio: 0.5 },
      foundations_ref: { authored: 0, emitted: 0, ratio: 1 },
      motion_ref: { authored: 0, emitted: 0, ratio: 1 },
    },
    overall: { authored: 10, emitted: 5, ratio: 0.5 },
  };
  var report = V.buildQualityReport(analysis, coverage, 0);
  assert.ok(
    report.some(function (e) {
      return (
        e.dimension === "coverage" &&
        e.metric === "a11y_ref" &&
        e.severity === "warning"
      );
    }),
  );
  assert.ok(
    report.some(function (e) {
      return (
        e.dimension === "integrity" &&
        e.metric === "dangling_edges" &&
        e.value === 1 &&
        e.severity === "violation"
      );
    }),
  );
});

test("emitted quality-report.json exists, is valid JSON, and matches the documented shape", function () {
  var fs = require("node:fs"),
    path = require("node:path");
  var root = path.join(__dirname, "..");
  var report = JSON.parse(
    fs.readFileSync(
      path.join(root, "graph", "dist", "quality-report.json"),
      "utf8",
    ),
  );
  assert.ok(Array.isArray(report) && report.length >= 8);
  report.forEach(function (e) {
    assert.deepEqual(Object.keys(e).sort(), [
      "dimension",
      "metric",
      "severity",
      "timestamp",
      "value",
    ]);
  });
  assert.ok(
    report.some(function (e) {
      return (
        e.dimension === "coverage" &&
        e.metric === "overall" &&
        e.value === 1 &&
        e.severity === "info"
      );
    }),
  );
});

test("analyze: counts composed_of edges into compositionEdges", function () {
  var vocab = {
    edgeTypes: {
      composed_of: { source: ["component"], target: ["component"] },
    },
  };
  var graph = {
    nodes: [
      { id: "component:a", type: "component", title: "a" },
      { id: "component:b", type: "component", title: "b" },
      { id: "component:c", type: "component", title: "c" },
    ],
    edges: [
      { source: "component:a", target: "component:b", type: "composed_of" },
      { source: "component:a", target: "component:c", type: "composed_of" },
    ],
  };
  assert.equal(V.analyze(graph, vocab).compositionEdges, 2);
});

test("buildQualityReport: surfaces a composition_edges connectivity count (defaults to 0)", function () {
  var base = {
    dangling: [],
    typeViolations: [],
    coverage: {
      categoriesWithoutA11y: [],
      criteriaUnreferenced: [],
      componentsWithoutCategory: [],
    },
    orphans: [],
  };
  var coverage = {
    byKind: {
      a11y_ref: { authored: 0, emitted: 0, ratio: 1 },
      foundations_ref: { authored: 0, emitted: 0, ratio: 1 },
      motion_ref: { authored: 0, emitted: 0, ratio: 1 },
    },
    overall: { authored: 0, emitted: 0, ratio: 1 },
  };
  var withCount = V.buildQualityReport(
    Object.assign({}, base, { compositionEdges: 7 }),
    coverage,
    0,
  );
  var m = withCount.find(function (e) {
    return e.metric === "composition_edges";
  });
  assert.ok(m, "composition_edges present");
  assert.equal(m.dimension, "connectivity");
  assert.equal(m.value, 7);
  assert.equal(m.severity, "info");
  assert.equal(m.timestamp, null);
  var noField = V.buildQualityReport(base, coverage, 0).find(function (e) {
    return e.metric === "composition_edges";
  });
  assert.equal(noField.value, 0);
});
