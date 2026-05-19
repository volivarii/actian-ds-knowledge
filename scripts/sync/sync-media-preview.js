"use strict";

// sync-media-preview — locate each component's "Overview" Figma frame,
// render it as a PNG via REST /v1/images, save to components/dist/media/<slug>/preview.png.
// First instance of the media convention (paths-manifest.json#components.media.ci).
//
// Naming note: the SOURCE artifact in Figma is a frame literally named
// "Overview" (designer-owned label). The DATA-SIDE role name is `preview`
// (DS convention: hero/preview for unlabeled representative shots; "overview"
// is reserved for sections + tabs). This module is the one place where that
// translation happens. Downstream (schema, render-mdx, MediaAsset) all
// speak `preview`.
//
// Find strategy: fetch the registry component's parent-context node via
// /nodes, walk its top-level children for a FRAME named "Overview"
// (case-insensitive). The test mocks `getNodes` directly; real Figma
// integration (Task 6 / runtime polish) will resolve component → parent
// page id and pass that to getNodes. See open-question note in plan
// §"Open questions (defer to implementation)".

var fs = require("fs");
var path = require("path");

// findPreviewSourceNode — given a parent node from /v1/files/.../nodes,
// return the id of the child FRAME named "Overview" (case-insensitive),
// or null. Figma-side label is owned by designers; data-side role is `preview`.
function findPreviewSourceNode(pageNode) {
  var doc = pageNode && pageNode.document;
  if (!doc || !Array.isArray(doc.children)) return null;
  for (var i = 0; i < doc.children.length; i++) {
    var c = doc.children[i];
    if (c && c.type === "FRAME" && typeof c.name === "string"
        && c.name.toLowerCase() === "overview") {
      return c.id;
    }
  }
  return null;
}

function writeIfChanged(absPath, bytes) {
  if (fs.existsSync(absPath)) {
    var existing = fs.readFileSync(absPath);
    if (existing.length === bytes.length && existing.equals(bytes)) return false;
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, bytes);
  return true;
}

async function run(opts) {
  if (!opts || !opts.registry) throw new Error("sync-media-preview: opts.registry required");
  if (!opts.outputDir) throw new Error("sync-media-preview: opts.outputDir required");
  if (!opts.rest) throw new Error("sync-media-preview: opts.rest required");

  var rest = opts.rest;
  var fileKey = opts.registry.fileKey;
  var components = opts.registry.components || {};

  var ids = Object.keys(components).map(function (slug) { return components[slug].nodeId; })
    .filter(function (x) { return !!x; });

  if (ids.length === 0) {
    return { captured: [], missing: [], skipped: Object.keys(components) };
  }

  var nodesResp = await rest.getNodes(fileKey, ids);
  var nodes = (nodesResp && nodesResp.nodes) || {};

  // Slug → preview source node id (or null). The source id refers to the
  // Figma "Overview" frame; on-disk filename will be preview.png.
  var pending = []; // [{ slug, sourceNodeId }]
  var missing = [];
  Object.keys(components).forEach(function (slug) {
    var c = components[slug];
    if (!c.nodeId) { missing.push(slug); return; }
    var page = nodes[c.nodeId];
    var srcId = findPreviewSourceNode(page);
    if (srcId) pending.push({ slug: slug, sourceNodeId: srcId });
    else missing.push(slug);
  });

  if (pending.length === 0) {
    return { captured: [], missing: missing.sort(), skipped: [] };
  }

  // Batch /v1/images call — Figma accepts comma-separated ids.
  var sourceIds = pending.map(function (p) { return p.sourceNodeId; });
  var imagesResp = await rest.getImages(fileKey, sourceIds, { format: "png", scale: 2 });
  var urlMap = (imagesResp && imagesResp.images) || {};

  var captured = [];
  for (var i = 0; i < pending.length; i++) {
    var p = pending[i];
    var signedUrl = urlMap[p.sourceNodeId];
    if (!signedUrl) { missing.push(p.slug); continue; }
    var bytes = await rest.fetchBinary(signedUrl);
    var outPath = path.join(opts.outputDir, p.slug, "preview.png");
    writeIfChanged(outPath, bytes);
    captured.push(p.slug);
  }

  return { captured: captured.sort(), missing: missing.sort(), skipped: [] };
}

module.exports = { run: run, findPreviewSourceNode: findPreviewSourceNode };
