// scripts/sync/sync-anatomy.js
"use strict";
var fs = require("node:fs");
var path = require("node:path");
var { buildAnatomyFile } = require("./normalize-anatomy");

// Resolve the Figma file key the SAME way syncRegistry does: opts.keys[kitId].
// Production .figma-keys.json maps kit id → file-key STRING (e.g. {dsKit: "abc"});
// tolerate an {fileKey} object shape too.
function fileKeyFor(keys, kit) {
  var v = (keys || {})[kit];
  if (v == null) return undefined;
  return typeof v === "string" ? v : v.fileKey || v;
}

function nodeIdToSlugMap(registry) {
  var map = {};
  var comps = (registry && registry.components) || {};
  Object.keys(comps).forEach(function (slug) {
    var nid = comps[slug] && comps[slug].nodeId;
    if (nid) map[nid] = slug;
  });
  return map;
}

async function varNameByIdFor(rest, fileKey) {
  if (!rest || typeof rest.getLocalVariables !== "function") return {};
  try {
    var resp = await rest.getLocalVariables(fileKey);
    var vars = (resp && resp.meta && resp.meta.variables) || {};
    var map = {};
    Object.keys(vars).forEach(function (id) {
      var v = vars[id];
      if (v && v.name)
        map[id] =
          "--" +
          String(v.name).replace(/\//g, "-").replace(/\s+/g, "-").toLowerCase();
    });
    return map;
  } catch (e) {
    return {};
  }
}

async function syncAnatomy(opts, kit) {
  var rest = opts.rest;
  var registriesDir = opts.registriesDir;
  var anatomyDir = opts.anatomyDir;
  var writeJson = opts.writeJson;
  var syncedAt = opts.syncedAt;
  var fileKey = fileKeyFor(opts.keys, kit);

  // Every sync phase must return { fileLabel, verdict:{category, changelog} } —
  // aggregateVerdict + buildChangelog read those. A new artifact class is "additive".
  function result(count, extra) {
    return Object.assign(
      {
        kind: "anatomy",
        kit: kit,
        count: count,
        fileLabel: "anatomy:" + kit,
        verdict: {
          category: "additive",
          changelog: "- Wrote " + count + " anatomy file(s).",
        },
      },
      extra || {},
    );
  }

  var regPath = path.join(registriesDir, "dskit.json");
  if (!fs.existsSync(regPath)) {
    return result(0, {
      skipped: "no registry",
      verdict: { category: "unchanged", changelog: "- skipped (no registry)." },
    });
  }
  var registry = JSON.parse(fs.readFileSync(regPath, "utf8"));
  var nodeIdToSlug = nodeIdToSlugMap(registry);
  var varNameById = await varNameByIdFor(rest, fileKey);

  var comps = registry.components || {};
  var slugs = Object.keys(comps);
  var ids = slugs
    .map(function (s) {
      return comps[s].nodeId;
    })
    .filter(Boolean);
  var resp = await rest.getNodes(fileKey, ids);
  var nodes = (resp && resp.nodes) || {};

  // Bundle is a slug→file MAP under a `components` envelope — keeps it off the top
  // level so writeJson's _schema_version injection never appears as a phantom slug.
  var bundle = { _schema_version: 1, components: {} };
  var count = 0;
  slugs.forEach(function (slug) {
    var nid = comps[slug].nodeId;
    var payload = nid && nodes[nid];
    var doc = payload && payload.document;
    if (!doc) return;
    var file = buildAnatomyFile(doc, {
      slug: slug,
      kit: kit.toLowerCase(),
      syncedAt: syncedAt,
      source: { fileKey: fileKey, nodeId: nid },
      nodeIdToSlug: nodeIdToSlug,
      varNameById: varNameById,
    });
    writeJson(path.join(anatomyDir, slug + ".json"), file);
    bundle.components[slug] = file;
    count++;
  });
  writeJson(path.join(anatomyDir, "..", "anatomy.bundle.json"), bundle);
  return result(count);
}

module.exports = { syncAnatomy, nodeIdToSlugMap, fileKeyFor };
