"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var D = require("../scripts/graph/derive-graph.js");

test("collectComponentsAndCategories: component nodes, category nodes, in_category edges", function () {
  var registries = {
    components: {
      "button": { name: "Button", category: "Action" },
      "data-grid": { name: "Data Grid", category: "Data Display" },
      "app-icon": { name: "App Icon", category: "Icons" }
    }
  };
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectComponentsAndCategories(g, [registries]);
  var out = g.build();
  var ids = out.nodes.map(function (n) { return n.id; });
  assert.ok(ids.includes("component:button"));
  assert.ok(ids.includes("category:action"));
  assert.ok(ids.includes("category:data-display"));
  assert.ok(ids.includes("category:icons"));
  var cat = out.nodes.find(function (n) { return n.id === "category:action"; });
  assert.equal(cat.provenance, "figma-dskit");
  assert.ok(out.edges.some(function (e) {
    return e.type === "in_category" && e.source === "component:button" && e.target === "category:action";
  }));
});
