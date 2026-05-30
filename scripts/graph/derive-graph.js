"use strict";

var fs = require("node:fs");
var path = require("node:path");
var M = require("../lib/graph/model.js");

var ROOT = path.resolve(__dirname, "..", "..");
function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

var REGISTRY_FILES = [
  "components/dist/registries/dskit.json",
  "components/dist/registries/fmkit.json",
  "components/dist/registries/metakit.json",
];

// Component nodes + category nodes (all distinct labels, slugified, figma-dskit) + in_category edges.
function collectComponentsAndCategories(g, registries) {
  registries.forEach(function (reg) {
    var comps = (reg && reg.components) || {};
    Object.keys(comps).forEach(function (slug) {
      var c = comps[slug];
      g.addNode({
        id: M.nodeId("component", slug),
        type: "component",
        title: c.name || slug,
      });
      if (c.category) {
        // fmkit/metakit components carry no category; node-only, no edge — not an error
        var catSlug = M.slugify(c.category);
        g.addNode({
          id: M.nodeId("category", catSlug),
          type: "category",
          title: c.category,
          provenance: "figma-dskit",
        });
        g.addEdge({
          source: M.nodeId("component", slug),
          target: M.nodeId("category", catSlug),
          type: "in_category",
        });
      }
    });
  });
}

function derive() {
  var g = new M.GraphBuilder();
  var registries = REGISTRY_FILES.filter(function (rel) {
    return fs.existsSync(path.join(ROOT, rel));
  }).map(readJSON);
  collectComponentsAndCategories(g, registries);
  // (later tasks add target nodes + transversal/related/child edges here)
  var out = g.build();
  var outPath = path.join(ROOT, "graph", "dist", "graph.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, M.stableStringify(out), "utf8");
  console.log(
    "derive-graph: wrote " +
      out.nodes.length +
      " nodes, " +
      out.edges.length +
      " edges → graph/dist/graph.json",
  );
  return out;
}

if (require.main === module) {
  try {
    derive();
  } catch (err) {
    console.error("derive-graph FAILED:", err.message);
    process.exit(1);
  }
}

module.exports = {
  derive: derive,
  collectComponentsAndCategories: collectComponentsAndCategories,
  readJSON: readJSON,
  ROOT: ROOT,
};
