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
// Find strategy:
//   1. getFile(fileKey, { depth: 2 }) — one call to get CANVAS → PAGE → top-level
//      frames. Builds componentId → pageId map.
//   2. getNodes(pageIds) — one batched call across all relevant pages.
//   3. Walk each page's direct children for a FRAME named "Overview".
//   4. getImages(uniqueOverviewIds, png, scale=2) — one batched call.
//   5. fetchBinary(signedUrl) per unique overview, write preview.png per slug.
//
// Multiple components on the same page share one Overview frame and one PNG
// download; the on-disk copy is duplicated per-slug for resolver simplicity.

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
  var slugs = Object.keys(components);

  if (slugs.length === 0) {
    return { captured: [], missing: [], skipped: [] };
  }

  // Step 1: walk the file tree once at depth 2 (CANVAS → PAGE → top-level frames)
  // to build a componentId → pageId map. Canvas children are pages; each page's
  // children include the component frames AND the "Overview" sibling frames.
  // depth=2 keeps the response small (no nested layers).
  var fileResp = await rest.getFile(fileKey, { depth: 2 });
  var document = fileResp && fileResp.document;
  if (!document || !Array.isArray(document.children)) {
    // Empty/malformed file: no captures possible.
    return { captured: [], missing: slugs.sort(), skipped: [] };
  }

  // Build componentId → pageId map by scanning each page's direct children.
  // A component can appear as a FRAME (standalone) or as a COMPONENT_SET
  // (variants set), so accept either.
  var componentToPage = {};
  document.children.forEach(function (page) {
    if (!page || !Array.isArray(page.children)) return;
    page.children.forEach(function (child) {
      if (!child || !child.id) return;
      componentToPage[child.id] = page.id;
    });
  });

  // Step 2: for each registered component, look up its parent page.
  // Components without a resolved page → missing. Dedupe page ids.
  var pendingPerPage = {}; // pageId → [slug, ...]
  var missing = [];
  slugs.forEach(function (slug) {
    var c = components[slug];
    if (!c || !c.nodeId) { missing.push(slug); return; }
    var pageId = componentToPage[c.nodeId];
    if (!pageId) { missing.push(slug); return; }
    if (!pendingPerPage[pageId]) pendingPerPage[pageId] = [];
    pendingPerPage[pageId].push(slug);
  });

  var pageIds = Object.keys(pendingPerPage);
  if (pageIds.length === 0) {
    return { captured: [], missing: missing.sort(), skipped: [] };
  }

  // Step 3: fetch each page's children via /v1/nodes. With depth not specified
  // the API returns the full subtree, but for "Overview" frame discovery we
  // only need direct children. Trust the existing getNodes batching.
  var nodesResp = await rest.getNodes(fileKey, pageIds);
  var nodes = (nodesResp && nodesResp.nodes) || {};

  // Step 4: for each page, locate the Overview frame; map back to each
  // slug whose component lives on that page.
  var pending = []; // [{ slug, sourceNodeId }]
  pageIds.forEach(function (pageId) {
    var pageNode = nodes[pageId];
    var overviewId = findPreviewSourceNode(pageNode);
    var slugsOnPage = pendingPerPage[pageId];
    if (overviewId) {
      slugsOnPage.forEach(function (slug) {
        pending.push({ slug: slug, sourceNodeId: overviewId });
      });
    } else {
      // No Overview on this page → all slugs here are missing.
      slugsOnPage.forEach(function (slug) { missing.push(slug); });
    }
  });

  if (pending.length === 0) {
    return { captured: [], missing: missing.sort(), skipped: [] };
  }

  // Step 5: render the Overview frames as PNG. Dedupe overview ids so each
  // page's Overview is only rendered once (multiple components on the same
  // page → same overview image; the on-disk copy is per-slug).
  var uniqueIds = Array.from(new Set(pending.map(function (p) { return p.sourceNodeId; })));
  var imagesResp = await rest.getImages(fileKey, uniqueIds, { format: "png", scale: 2 });
  var urlMap = (imagesResp && imagesResp.images) || {};

  // Step 6: download + write each slug's preview.png. Multiple slugs on the
  // same page get the same bytes (we re-fetch per slug for code simplicity;
  // a future optimization could cache the buffer keyed by sourceNodeId).
  var captured = [];
  var bufferCache = {}; // sourceNodeId → Buffer
  for (var i = 0; i < pending.length; i++) {
    var p = pending[i];
    var signedUrl = urlMap[p.sourceNodeId];
    if (!signedUrl) { missing.push(p.slug); continue; }
    var bytes = bufferCache[p.sourceNodeId];
    if (!bytes) {
      bytes = await rest.fetchBinary(signedUrl);
      bufferCache[p.sourceNodeId] = bytes;
    }
    var outPath = path.join(opts.outputDir, p.slug, "preview.png");
    writeIfChanged(outPath, bytes);
    captured.push(p.slug);
  }

  return { captured: captured.sort(), missing: missing.sort(), skipped: [] };
}

module.exports = { run: run, findPreviewSourceNode: findPreviewSourceNode };
