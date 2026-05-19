"use strict";

// sync-media-preview — locate per-component capture frames in Figma,
// render them as PNGs via REST /v1/images, save under
// components/dist/media/<slug>/<role>.png.
// First instance of the media convention (paths-manifest.json#components.media.ci).
//
// Naming note: SOURCE-side frame names live in Figma (designer-owned). DATA-side
// role names follow DS asset convention (`preview`, `parts`, `variations`,
// `spacing` — never `overview`, which is reserved for sections + tabs).
// `ROLE_FINDERS` below is the single place where that translation happens.
//
// Figma structure expectation: every component lives on a CANVAS (page); each
// page also carries a "Design guidelines" wrapper frame; each capture role's
// source frame lives DIRECTLY inside that wrapper. Adding a new role = one
// entry in ROLE_FINDERS. Adding a new wrapper-structure pattern = the same
// (just point `parent` at a different wrapper name).
//
// Find pipeline:
//   1. getFile(fileKey, { depth: 0 }) — one call, full tree. Build
//      componentId → pageId map so we know which slugs to capture for which
//      pages.
//   2. For each registered slug × each role in ROLE_FINDERS:
//      walk the slug's page subtree for a FRAME named ROLE_FINDERS[role].parent
//      (case-insensitive, recursive), then look in its direct children for a
//      FRAME named ROLE_FINDERS[role].child. Record (slug, role, sourceNodeId).
//   3. getImages(fileKey, uniqueSourceIds, { format: "png", scale: 2 }) — one
//      batched call across all roles + pages.
//   4. fetchBinary(signedUrl) per unique source, writeIfChanged to
//      <outputDir>/<slug>/<role>.png. Buffer cache keyed by sourceNodeId
//      avoids re-downloading when multiple slugs share a source (same page).

var fs = require("fs");
var path = require("path");

// ROLE_FINDERS — per-role Figma source-frame addressing. Adding a role to this
// map activates capture for that role on the next sync run; no other code
// changes required. All matches are case-insensitive.
//
// Future roles planned by the design team (commented out until the source
// frames exist in Figma):
//   parts:      { parent: "Design guidelines", child: "Parts" },
//   variations: { parent: "Design guidelines", child: "Variations" },
//   spacing:    { parent: "Design guidelines", child: "Spacing & size" },
var ROLE_FINDERS = {
  preview: { parent: "Design guidelines", child: "Overview" },
};

// Recursive case-insensitive frame-by-name finder. Returns the matching FRAME
// node or null. Walks the entire subtree under `node`, not just direct
// children — handles arbitrary wrapper nesting on the page.
function findFrameByNameRecursive(node, name) {
  if (!node) return null;
  var lcName = name.toLowerCase();
  if (node.type === "FRAME" && typeof node.name === "string"
      && node.name.toLowerCase() === lcName) {
    return node;
  }
  if (!Array.isArray(node.children)) return null;
  for (var i = 0; i < node.children.length; i++) {
    var found = findFrameByNameRecursive(node.children[i], name);
    if (found) return found;
  }
  return null;
}

// findRoleSourceNode — given a page subtree (document of a CANVAS page) and a
// role-finder spec ({ parent, child }), locate the wrapper frame (recursively)
// then the named child frame inside its direct children. Returns the child
// node id or null. Both matches are case-insensitive.
function findRoleSourceNode(pageNode, findSpec) {
  var doc = pageNode && pageNode.document ? pageNode.document : pageNode;
  if (!doc) return null;
  var wrapper = findFrameByNameRecursive(doc, findSpec.parent);
  if (!wrapper || !Array.isArray(wrapper.children)) return null;
  var lcChild = findSpec.child.toLowerCase();
  for (var i = 0; i < wrapper.children.length; i++) {
    var c = wrapper.children[i];
    if (c && c.type === "FRAME" && typeof c.name === "string"
        && c.name.toLowerCase() === lcChild) {
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
  var roleNames = Object.keys(ROLE_FINDERS);

  if (slugs.length === 0 || roleNames.length === 0) {
    return { captured: [], missing: [], skipped: [] };
  }

  // Step 1: fetch the full file tree once. Reasoning: each role's source
  // frame can be at arbitrary nesting depth under its page. Fetching the
  // full tree avoids depth-tuning churn; one large response is cheaper
  // than N depth-limited probes.
  var fileResp = await rest.getFile(fileKey, { depth: 0 });
  var fileDoc = fileResp && fileResp.document;
  if (!fileDoc || !Array.isArray(fileDoc.children)) {
    return { captured: [], missing: slugs.sort(), skipped: [] };
  }

  // Index pages by id for direct lookup later.
  var pagesById = {};
  fileDoc.children.forEach(function (page) {
    if (page && page.id) pagesById[page.id] = page;
  });

  // Build componentId → pageId map by scanning each page's direct children.
  // Components are typically top-level page children (FRAME or COMPONENT_SET).
  var componentToPage = {};
  fileDoc.children.forEach(function (page) {
    if (!page || !Array.isArray(page.children)) return;
    page.children.forEach(function (child) {
      if (child && child.id) componentToPage[child.id] = page.id;
    });
  });

  // Step 2: for each (slug, role), find the source frame id. Track results
  // and dedupe by sourceNodeId so the same Overview frame on a page shared
  // by N components gets fetched once.
  // pending[i] = { slug, role, sourceNodeId }
  // missing[i] = { slug, role }  — surfaced in summary; per-slug aggregation below
  var pending = [];
  var missingPairs = [];
  slugs.forEach(function (slug) {
    var c = components[slug];
    if (!c || !c.nodeId) {
      roleNames.forEach(function (r) { missingPairs.push({ slug: slug, role: r }); });
      return;
    }
    var pageId = componentToPage[c.nodeId];
    if (!pageId || !pagesById[pageId]) {
      roleNames.forEach(function (r) { missingPairs.push({ slug: slug, role: r }); });
      return;
    }
    var page = pagesById[pageId];
    roleNames.forEach(function (role) {
      var srcId = findRoleSourceNode(page, ROLE_FINDERS[role]);
      if (srcId) pending.push({ slug: slug, role: role, sourceNodeId: srcId });
      else missingPairs.push({ slug: slug, role: role });
    });
  });

  if (pending.length === 0) {
    // Aggregate missing by slug for the changelog (caller-friendly).
    return {
      captured: [],
      missing: aggregateMissing(missingPairs).sort(),
      skipped: [],
    };
  }

  // Step 3: batched getImages over unique source ids.
  var uniqueIds = Array.from(new Set(pending.map(function (p) { return p.sourceNodeId; })));
  var imagesResp = await rest.getImages(fileKey, uniqueIds, { format: "png", scale: 2 });
  var urlMap = (imagesResp && imagesResp.images) || {};

  // Step 4: download + write. Buffer cache keyed by sourceNodeId so multiple
  // slugs/roles pointing at the same Figma frame only download once.
  var captured = [];
  var bufferCache = {};
  for (var i = 0; i < pending.length; i++) {
    var p = pending[i];
    var signedUrl = urlMap[p.sourceNodeId];
    if (!signedUrl) {
      missingPairs.push({ slug: p.slug, role: p.role });
      continue;
    }
    var bytes = bufferCache[p.sourceNodeId];
    if (!bytes) {
      bytes = await rest.fetchBinary(signedUrl);
      bufferCache[p.sourceNodeId] = bytes;
    }
    var outPath = path.join(opts.outputDir, p.slug, p.role + ".png");
    writeIfChanged(outPath, bytes);
    captured.push(p.slug + "/" + p.role);
  }

  return {
    captured: captured.sort(),
    missing: aggregateMissing(missingPairs).sort(),
    skipped: [],
  };
}

// aggregateMissing — collapse (slug, role) pairs into slug-only entries when
// ALL roles are missing for that slug; otherwise emit a "slug:role" entry per
// missing role. Keeps the changelog readable for partial-capture cases.
function aggregateMissing(pairs) {
  if (pairs.length === 0) return [];
  var byslug = {};
  pairs.forEach(function (p) {
    if (!byslug[p.slug]) byslug[p.slug] = [];
    byslug[p.slug].push(p.role);
  });
  var totalRoles = Object.keys(ROLE_FINDERS).length;
  var result = [];
  Object.keys(byslug).forEach(function (slug) {
    var rolesForSlug = byslug[slug];
    if (rolesForSlug.length === totalRoles) {
      // All roles missing → slug-only entry.
      result.push(slug);
    } else {
      // Partial → emit each missing role.
      rolesForSlug.forEach(function (r) { result.push(slug + ":" + r); });
    }
  });
  return result;
}

module.exports = {
  run: run,
  findRoleSourceNode: findRoleSourceNode,
  findFrameByNameRecursive: findFrameByNameRecursive,
  ROLE_FINDERS: ROLE_FINDERS,
};
