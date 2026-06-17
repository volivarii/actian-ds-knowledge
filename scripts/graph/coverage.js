"use strict";

// Independent coverage counter for the knowledge graph. It re-counts authored
// transversal refs from source docs and compares to the edges actually emitted
// in graph.json. Independence is on the EMITTED axis (this counts graph edges
// separately from the derive) — it catches the derive silently DROPPING authored
// refs. The authoring-LOCATION (which fields hold refs) is shared with the derive
// via scripts/lib/graph/ref-kinds.js; the "authored-location canary" test guards
// that axis. Coverage = emitted / authored per kind.

var fs = require("node:fs");
var path = require("node:path");
var M = require("../lib/graph/model.js");
var refKinds = require("../lib/graph/ref-kinds.js");

var ROOT = path.resolve(__dirname, "..", "..");

var EDGE_KINDS = refKinds.EDGE_KINDS;
var CATEGORY_REF_KINDS = refKinds.CATEGORY_REF_KINDS;
var COMPONENT_REF_KINDS = refKinds.COMPONENT_REF_KINDS;

// Independently read authored transversal ref-pairs from source docs, keyed
// identically to the derive (Set of "source|target" per edge kind, deduped).
// Per-component refs are source-guarded by node existence, matching the
// derive's `hasNode` guard, so canonical-only/orphan-guidance docs don't count.
function readAuthored(root, nodeIds) {
  var authored = {};
  EDGE_KINDS.forEach(function (k) {
    authored[k] = new Set();
  });

  var catDir = path.join(root, "components", "dist", "categories");
  if (fs.existsSync(catDir)) {
    fs.readdirSync(catDir)
      .filter(function (f) {
        return f.endsWith("-defaults.json");
      })
      .forEach(function (f) {
        var catSlug = f.replace(/-defaults\.json$/, "");
        var src = M.nodeId("category", catSlug);
        var defaults = JSON.parse(
          fs.readFileSync(path.join(catDir, f), "utf8"),
        );
        CATEGORY_REF_KINDS.forEach(function (k) {
          var refs = (defaults[k.field] && defaults[k.field][k.list]) || [];
          refs.forEach(function (r) {
            if (!r || !r.ref) return;
            authored[k.edge].add(src + "|" + M.nodeId(k.targetType, r.ref));
          });
        });
      });
  }

  var gDir = path.join(root, "components", "dist", "guidelines");
  if (fs.existsSync(gDir)) {
    fs.readdirSync(gDir)
      .filter(function (f) {
        return f.endsWith(".json") && f !== "guidelines.bundle.json";
      })
      .forEach(function (f) {
        var slug = f.replace(/\.json$/, "");
        var src = M.nodeId("component", slug);
        if (!nodeIds.has(src)) return; // mirror derive's hasNode guard
        var doc = JSON.parse(fs.readFileSync(path.join(gDir, f), "utf8"));
        var meta = doc.meta || {};
        COMPONENT_REF_KINDS.forEach(function (k) {
          var refs = meta[k.field];
          if (!Array.isArray(refs)) return;
          refs.forEach(function (r) {
            if (!r || !r.ref) return;
            authored[k.edge].add(src + "|" + M.nodeId(k.targetType, r.ref));
          });
        });
      });
  }

  return authored;
}

// Pure: given authored ref-pair Sets per kind and the graph, compute coverage.
function coverageFromAuthored(authored, graph) {
  var emitted = {};
  EDGE_KINDS.forEach(function (k) {
    emitted[k] = 0;
  });
  graph.edges.forEach(function (e) {
    if (Object.prototype.hasOwnProperty.call(emitted, e.type))
      emitted[e.type] += 1;
  });
  var byKind = {};
  var totalA = 0;
  var totalE = 0;
  EDGE_KINDS.forEach(function (k) {
    var a = (authored[k] && authored[k].size) || 0;
    var em = emitted[k];
    totalA += a;
    totalE += em;
    byKind[k] = { authored: a, emitted: em, ratio: a === 0 ? 1 : em / a };
  });
  return {
    byKind: byKind,
    overall: {
      authored: totalA,
      emitted: totalE,
      ratio: totalA === 0 ? 1 : totalE / totalA,
    },
  };
}

// Read authored refs from `root`, count emitted edges in `graph`, return coverage.
function computeCoverage(root, graph) {
  var nodeIds = new Set(
    graph.nodes.map(function (n) {
      return n.id;
    }),
  );
  return coverageFromAuthored(readAuthored(root, nodeIds), graph);
}

module.exports = {
  EDGE_KINDS: EDGE_KINDS,
  readAuthored: readAuthored,
  coverageFromAuthored: coverageFromAuthored,
  computeCoverage: computeCoverage,
  ROOT: ROOT,
};
