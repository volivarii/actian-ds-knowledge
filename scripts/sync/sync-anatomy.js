// scripts/sync/sync-anatomy.js
"use strict";
var fs = require("node:fs");
var path = require("node:path");
var { buildAnatomyFile } = require("./normalize-anatomy");

function fileKeyFor(keys, kit) {
  var k = keys || {};
  if (k.dskit && kit === "ds") return k.dskit.fileKey || k.dskit;
  if (k[kit] && k[kit].fileKey) return k[kit].fileKey;
  if (k[kit + "Kit"] && k[kit + "Kit"].fileKey) return k[kit + "Kit"].fileKey;
  return k.dskit && (k.dskit.fileKey || k.dskit);
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
      if (v && v.name) map[id] = "--" + String(v.name).replace(/\//g, "-").replace(/\s+/g, "-").toLowerCase();
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

  var regPath = path.join(registriesDir, "dskit.json");
  if (!fs.existsSync(regPath)) return { kind: "anatomy", kit: kit, count: 0, skipped: "no registry" };
  var registry = JSON.parse(fs.readFileSync(regPath, "utf8"));
  var nodeIdToSlug = nodeIdToSlugMap(registry);
  var varNameById = await varNameByIdFor(rest, fileKey);

  var comps = registry.components || {};
  var slugs = Object.keys(comps);
  var ids = slugs.map(function (s) { return comps[s].nodeId; }).filter(Boolean);
  var resp = await rest.getNodes(fileKey, ids);
  var nodes = (resp && resp.nodes) || {};

  var bundle = {};
  var count = 0;
  slugs.forEach(function (slug) {
    var nid = comps[slug].nodeId;
    var payload = nodes[nid];
    var doc = payload && payload.document;
    if (!doc) return;
    var file = buildAnatomyFile(doc, {
      slug: slug, kit: kit === "ds" ? "dskit" : kit, syncedAt: syncedAt,
      source: { fileKey: fileKey, nodeId: nid },
      nodeIdToSlug: nodeIdToSlug, varNameById: varNameById,
    });
    writeJson(path.join(anatomyDir, slug + ".json"), file);
    bundle[slug] = file;
    count++;
  });
  writeJson(path.join(anatomyDir, "..", "anatomy.bundle.json"), bundle);
  return { kind: "anatomy", kit: kit, count: count };
}

module.exports = { syncAnatomy, nodeIdToSlugMap, fileKeyFor };
