"use strict";
// READ-ONLY spike diagnostic. Reuses the real REST client + the anatomy fetch
// shape to measure whether nested composite instances can be resolved to their
// component via components[componentId].componentSetId -> registry nodeId. It
// writes only a report (scratch path + CI artifact); it touches no dist, no
// sync code, no schema. Throwaway; removed after the decision.
var fs = require("node:fs");
var path = require("node:path");

// First-wins union of every getNodes subtree's `components` dict. Keeps the full
// entry (key, name, componentSetId) unlike the sync's key-only merge.
function mergeComponentEntries(nodes) {
  var map = {};
  Object.keys(nodes || {}).forEach(function (id) {
    var comps = nodes[id] && nodes[id].components;
    if (!comps) return;
    Object.keys(comps).forEach(function (cid) {
      if (!map[cid]) map[cid] = comps[cid];
    });
  });
  return map;
}

// Every INSTANCE node in a Figma document subtree (recursive).
function collectInstances(document) {
  var out = [];
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (n.type === "INSTANCE") out.push(n);
    if (Array.isArray(n.children)) n.children.forEach(walk);
  })(document);
  return out;
}

// Classify how an INSTANCE resolves: today (nodeId or key) and whether the
// untapped componentSetId bridge would resolve it.
function classifyInstance(node, entries, nodeIdToSlug, keyToSlug) {
  var cid = node.componentId || null;
  var entry = cid ? entries[cid] : null;
  var key = (entry && entry.key) || null;
  var setId = (entry && entry.componentSetId) || null;
  var slugViaNodeId = cid ? nodeIdToSlug[cid] || null : null;
  var slugViaKey = key ? keyToSlug[key] || null : null;
  var slugViaSetId = setId ? nodeIdToSlug[setId] || null : null;
  return {
    name: node.name || "",
    componentId: cid,
    hasEntry: !!entry,
    key: key,
    componentSetId: setId,
    slugViaNodeId: slugViaNodeId,
    slugViaKey: slugViaKey,
    slugViaSetId: slugViaSetId,
    resolvedToday: !!(slugViaNodeId || slugViaKey),
    resolvableViaSetId: !!slugViaSetId,
  };
}

function aggregate(records) {
  var unresolved = records.filter(function (r) {
    return !r.resolvedToday;
  });
  var n = unresolved.length;
  function count(f) {
    return unresolved.filter(f).length;
  }
  function pct(f) {
    return n ? Math.round((count(f) / n) * 1000) / 10 : 0;
  }
  return {
    totalInstances: records.length,
    resolvedToday: records.filter(function (r) {
      return r.resolvedToday;
    }).length,
    unresolved: n,
    unresolvedWithComponentId: count(function (r) {
      return !!r.componentId;
    }),
    unresolvedWithEntry: count(function (r) {
      return r.hasEntry;
    }),
    unresolvedWithSetId: count(function (r) {
      return !!r.componentSetId;
    }),
    unresolvedResolvableViaSetId: count(function (r) {
      return r.resolvableViaSetId;
    }),
    unresolvedResolvableViaKey: count(function (r) {
      return !!r.slugViaKey;
    }),
    pctResolvableViaSetId: pct(function (r) {
      return r.resolvableViaSetId;
    }),
  };
}

var REPO_ROOT = path.join(__dirname, "..", "..");

// Registry -> resolution maps + the non-icon set ids to fetch (mirrors
// sync-anatomy: icons have no layout anatomy and are excluded).
function buildMaps(registry) {
  var comps = (registry && registry.components) || {};
  var nodeIdToSlug = {};
  var keyToSlug = {};
  var ids = [];
  Object.keys(comps).forEach(function (slug) {
    var c = comps[slug] || {};
    if (c.nodeId) nodeIdToSlug[c.nodeId] = slug;
    if (c.key) keyToSlug[c.key] = slug;
    if (c.category !== "Icons" && c.nodeId) ids.push(c.nodeId);
  });
  return { nodeIdToSlug: nodeIdToSlug, keyToSlug: keyToSlug, ids: ids };
}

async function main() {
  var rest = require("../sync/figma-rest.js");
  var keys = JSON.parse(process.env.FIGMA_KEYS_JSON || "{}");
  var fileKeyRaw = keys.dsKit;
  var fileKey =
    typeof fileKeyRaw === "string"
      ? fileKeyRaw
      : fileKeyRaw && fileKeyRaw.fileKey;
  if (!fileKey) throw new Error("no dsKit file key (set FIGMA_KEYS_JSON)");
  var registry = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, "components/dist/registries/dskit.json"),
      "utf8",
    ),
  );
  var maps = buildMaps(registry);

  var resp = await rest.getNodes(fileKey, maps.ids);
  var nodes = (resp && resp.nodes) || {};
  var entries = mergeComponentEntries(nodes);

  var records = [];
  maps.ids.forEach(function (nid) {
    var doc = nodes[nid] && nodes[nid].document;
    if (!doc) return;
    collectInstances(doc).forEach(function (inst) {
      records.push(
        classifyInstance(inst, entries, maps.nodeIdToSlug, maps.keyToSlug),
      );
    });
  });

  var summary = aggregate(records);
  var examples = records
    .filter(function (r) {
      return !r.resolvedToday && r.componentSetId;
    })
    .slice(0, 15);

  var report = {
    generatedAt: null,
    summary: summary,
    examples: examples,
    records: records,
  };
  var outPath =
    process.env.SPIKE_REPORT_PATH ||
    path.join(REPO_ROOT, "nested-resolution-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("=== nested-resolution spike summary ===");
  Object.keys(summary).forEach(function (k) {
    console.log(k + ": " + summary[k]);
  });
  console.log("report written to " + outPath);
}

if (require.main === module) {
  main().catch(function (e) {
    console.error("diagnose FAILED:", e.message);
    process.exit(1);
  });
}

module.exports = {
  mergeComponentEntries: mergeComponentEntries,
  collectInstances: collectInstances,
  classifyInstance: classifyInstance,
  aggregate: aggregate,
  buildMaps: buildMaps,
};
