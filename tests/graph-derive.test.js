"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var D = require("../scripts/graph/derive-graph.js");

test("collectComponentsAndCategories: component nodes, category nodes, in_category edges", function () {
  var registries = {
    components: {
      button: { name: "Button", category: "Action" },
      "data-grid": { name: "Data Grid", category: "Data Display" },
      "app-icon": { name: "App Icon", category: "Icons" },
      "icon-only": { name: "Icon only" },
    },
  };
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectComponentsAndCategories(g, [registries]);
  var out = g.build();
  var ids = out.nodes.map(function (n) {
    return n.id;
  });
  assert.ok(ids.includes("component:button"));
  assert.ok(ids.includes("category:action"));
  assert.ok(ids.includes("category:data-display"));
  assert.ok(ids.includes("category:icons"));
  var cat = out.nodes.find(function (n) {
    return n.id === "category:action";
  });
  assert.equal(cat.provenance, "figma-dskit");
  assert.ok(
    out.edges.some(function (e) {
      return (
        e.type === "in_category" &&
        e.source === "component:button" &&
        e.target === "category:action"
      );
    }),
  );
  assert.ok(
    ids.includes("component:icon-only"),
    "no-category component still gets a node",
  );
  assert.ok(
    !out.edges.some(function (e) {
      return e.source === "component:icon-only";
    }),
    "no-category component gets no in_category edge",
  );
});

test("collectA11yCriteria: nodes from a11y-index sections", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectA11yCriteria(g, {
    sections: [
      { slug: "color-contrast", title: "Color & Contrast", wcag: ["1.4.1"] },
    ],
  });
  var n = g.build().nodes.find(function (x) {
    return x.id === "a11y:color-contrast";
  });
  assert.equal(n.type, "a11y_criterion");
  assert.deepEqual(n.wcag, ["1.4.1"]);
});
test("collectFoundationSections: nodes from the foundations bundle tree (recursive)", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectFoundationSections(g, {
    id: "",
    title: "root",
    children: [
      {
        id: "tokens",
        title: "Tokens",
        children: [{ id: "tokens/spacing", title: "Spacing" }],
      },
    ],
  });
  var ids = g.build().nodes.map(function (n) {
    return n.id;
  });
  assert.ok(ids.includes("foundation:tokens"));
  assert.ok(ids.includes("foundation:tokens/spacing"));
  assert.ok(!ids.includes("foundation:"));
});
test("collectMotionPatterns: nodes from motion.patterns keys", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectMotionPatterns(g, {
    patterns: { "skeleton-loading": { title: "Skeleton Loading" } },
  });
  var n = g.build().nodes.find(function (x) {
    return x.id === "motion:skeleton-loading";
  });
  assert.equal(n.type, "motion_pattern");
});
