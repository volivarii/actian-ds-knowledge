"use strict";

var fs = require("node:fs");
var path = require("node:path");
var M = require("../lib/graph/model.js");
var refKinds = require("../lib/graph/ref-kinds.js");
var categoriesParser = require("../categories/categories-parser.js");

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
  // Components are deduped by slug across registries (GraphBuilder first-wins); REGISTRY_FILES lists dskit first, so dskit's title wins on cross-kit slug collisions.
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
  Object.keys(pats).forEach(function (key) {
    var p = pats[key] || {};
    var slug = p.slug || key; // motion_ref edges target the pattern's .slug; fall back to the object key
    g.addNode({
      id: M.nodeId("motion_pattern", slug),
      type: "motion_pattern",
      title: p.title || p.name || slug,
    });
  });
}

var REF_KINDS = refKinds.CATEGORY_REF_KINDS;
function collectTransversalRefs(g, catSlug, defaults) {
  var sourceFile =
    (defaults._meta && defaults._meta.source) ||
    "components/dist/categories/" + catSlug + "-defaults.json";
  REF_KINDS.forEach(function (k) {
    var refs = (defaults[k.field] && defaults[k.field][k.list]) || [];
    refs.forEach(function (r) {
      if (!r || !r.ref) return;
      var edge = {
        source: M.nodeId("category", catSlug),
        target: M.nodeId(k.targetType, r.ref),
        type: k.edge,
        scope: "category",
        confidence: "asserted",
        provenance: {
          source_file: sourceFile,
          deriver: "derive-graph.js",
          method: k.field + "." + k.list,
        },
      };
      if (r.note) edge.note = r.note;
      g.addEdge(edge);
    });
  });
}
var COMPONENT_REF_KINDS = refKinds.COMPONENT_REF_KINDS;
function collectComponentRefs(g, entries) {
  entries.forEach(function (entry) {
    var slug = entry && entry.slug;
    var doc = (entry && entry.doc) || {};
    if (!slug) return;
    // Key by FILENAME slug (= registry component slug). Alias copies carry the
    // canonical slug in doc.slug but the registry slug in the filename; the node
    // guard keeps each edge attached to a real component node and drops
    // canonical-only or orphan-guidance docs (no node → no edge, no dangle).
    if (!g.hasNode(M.nodeId("component", slug))) return;
    var meta = doc.meta || {};
    var sourceFile =
      (doc._meta && doc._meta.source) ||
      "components/dist/guidelines/" + slug + ".json";
    COMPONENT_REF_KINDS.forEach(function (k) {
      var refs = meta[k.field];
      if (!Array.isArray(refs)) return;
      refs.forEach(function (r) {
        if (!r || !r.ref) return;
        var edge = {
          source: M.nodeId("component", slug),
          target: M.nodeId(k.targetType, r.ref),
          type: k.edge,
          scope: "component",
          confidence: "asserted",
          provenance: {
            source_file: sourceFile,
            deriver: "derive-graph.js",
            method: "meta." + k.field,
          },
        };
        if (r.note) edge.note = r.note;
        g.addEdge(edge);
      });
    });
  });
}
function readGuidelineDocs() {
  var dir = path.join(ROOT, "components", "dist", "guidelines");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(function (f) {
      return f.endsWith(".json") && f !== "guidelines.bundle.json";
    })
    .map(function (f) {
      return {
        slug: f.replace(/\.json$/, ""),
        doc: readJSON("components/dist/guidelines/" + f),
      };
    });
}
function collectRelated(g, contentEntries) {
  contentEntries.forEach(function (entry) {
    if (
      !Array.isArray(entry.relatedComponents) ||
      entry.relatedComponents.length === 0
    )
      return;
    g.addNode({
      id: M.nodeId("content_topic", entry.slug),
      type: "content_topic",
      title: entry.title || entry.slug,
    });
    entry.relatedComponents.forEach(function (compSlug) {
      g.addEdge({
        source: M.nodeId("content_topic", entry.slug),
        target: M.nodeId("component", compSlug),
        type: "related",
      });
    });
  });
}
function collectFoundationChildEdges(g, root) {
  (function walk(node) {
    if (node && Array.isArray(node.children)) {
      node.children.forEach(function (child) {
        if (
          node.id !== undefined &&
          node.id !== "" &&
          child.id !== undefined &&
          child.id !== ""
        ) {
          // SKOS-style broader/narrower hierarchy (non-transitive; topical,
          // NOT subclass or part-of). The function name is historical.
          g.addEdge({
            source: M.nodeId("foundation_section", node.id),
            target: M.nodeId("foundation_section", child.id),
            type: "narrower",
          });
        }
        walk(child);
      });
    }
  })(root);
}
function readContentEntries() {
  var dir = path.join(ROOT, "content", "src");
  if (!fs.existsSync(dir)) return [];
  var out = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (ent) {
      var p = path.join(d, ent.name);
      if (ent.isDirectory()) return walk(p);
      if (!ent.name.endsWith(".md") || ent.name === "AUTHORING.md") return;
      var src = fs.readFileSync(p, "utf8");
      // Skip files without a frontmatter fence
      if (!src.startsWith("---")) return;
      var fm;
      try {
        fm = categoriesParser.parse(src).data;
      } catch (err) {
        console.warn(
          "derive-graph: skipping " +
            p +
            " (frontmatter parse error: " +
            err.message +
            ")",
        );
        return;
      }
      if (Array.isArray(fm.relatedComponents)) {
        out.push({
          slug: path.basename(ent.name, ".md"),
          title: fm.title || path.basename(ent.name, ".md"),
          relatedComponents: fm.relatedComponents,
        });
      }
    });
  })(dir);
  return out;
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
  var catDir = path.join(ROOT, "components/dist/categories");
  if (fs.existsSync(catDir)) {
    fs.readdirSync(catDir)
      .filter(function (f) {
        return f.endsWith("-defaults.json");
      })
      .forEach(function (f) {
        var catSlug = f.replace(/-defaults\.json$/, "");
        collectTransversalRefs(
          g,
          catSlug,
          readJSON("components/dist/categories/" + f),
        );
      });
  }
  collectComponentRefs(g, readGuidelineDocs());
  collectRelated(g, readContentEntries());
  if (
    fs.existsSync(path.join(ROOT, "foundations/dist/foundations.bundle.json"))
  ) {
    collectFoundationChildEdges(
      g,
      bundleToTree(readJSON("foundations/dist/foundations.bundle.json")),
    );
  }
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
  collectTransversalRefs: collectTransversalRefs,
  collectComponentRefs: collectComponentRefs,
  readGuidelineDocs: readGuidelineDocs,
  collectRelated: collectRelated,
  collectFoundationChildEdges: collectFoundationChildEdges,
  readJSON: readJSON,
  ROOT: ROOT,
};
