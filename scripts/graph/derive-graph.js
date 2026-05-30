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

function collectA11yCriteria(g, a11yIndex) {
  (a11yIndex.sections || []).forEach(function (s) {
    var node = {
      id: M.nodeId("a11y_criterion", s.slug),
      type: "a11y_criterion",
      title: s.title || s.slug,
    };
    if (Array.isArray(s.wcag) && s.wcag.length) node.wcag = s.wcag;
    g.addNode(node);
  });
}

function collectFoundationSections(g, root) {
  (function walk(node) {
    if (node && typeof node.id === "string" && node.id !== "") {
      g.addNode({
        id: M.nodeId("foundation_section", node.id),
        type: "foundation_section",
        title: node.title || node.id,
      });
    }
    if (node && Array.isArray(node.children)) node.children.forEach(walk);
  })(root);
}

function collectMotionPatterns(g, motion) {
  var pats = (motion && motion.patterns) || {};
  Object.keys(pats).forEach(function (slug) {
    var p = pats[slug] || {};
    g.addNode({
      id: M.nodeId("motion_pattern", slug),
      type: "motion_pattern",
      title: p.title || p.name || slug,
    });
  });
}

// Reconstruct the recursive {id, children} tree from foundations.bundle.json.
// Children are referenced by their last path segment as the key in the LOCAL parent
// bundle object (scoped — no cross-branch collision). Intermediate nodes have a nested
// _index; leaf nodes do not — for those, the childRef {id, title} is used directly.
function bundleToTree(bundle) {
  var rootIdx = bundle._index;
  if (!rootIdx) return { id: "", title: "", children: [] };
  function buildNode(idx, parentBundle) {
    var node = { id: idx.id || "", title: idx.title || "" };
    var children = (idx.children || []).map(function (childRef) {
      // Look up by last path segment (the key used in the bundle object)
      var childSeg = childRef.id.split("/").pop();
      var subObj = parentBundle[childSeg];
      if (subObj && subObj._index) {
        return buildNode(subObj._index, subObj);
      }
      return { id: childRef.id, title: childRef.title || childRef.id };
    });
    if (children.length) node.children = children;
    return node;
  }
  return buildNode(rootIdx, bundle);
}

function derive() {
  var g = new M.GraphBuilder();
  var registries = REGISTRY_FILES.filter(function (rel) {
    return fs.existsSync(path.join(ROOT, rel));
  }).map(readJSON);
  collectComponentsAndCategories(g, registries);
  if (fs.existsSync(path.join(ROOT, "accessibility/dist/a11y-index.json"))) {
    collectA11yCriteria(g, readJSON("accessibility/dist/a11y-index.json"));
  }
  if (
    fs.existsSync(path.join(ROOT, "foundations/dist/foundations.bundle.json"))
  ) {
    collectFoundationSections(
      g,
      bundleToTree(readJSON("foundations/dist/foundations.bundle.json")),
    );
  }
  if (fs.existsSync(path.join(ROOT, "foundations/dist/tokens/motion.json"))) {
    collectMotionPatterns(g, readJSON("foundations/dist/tokens/motion.json"));
  }
  // (later tasks add transversal/related/child edges here)
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
  bundleToTree: bundleToTree,
  collectComponentsAndCategories: collectComponentsAndCategories,
  collectA11yCriteria: collectA11yCriteria,
  collectFoundationSections: collectFoundationSections,
  collectMotionPatterns: collectMotionPatterns,
  readJSON: readJSON,
  ROOT: ROOT,
};
