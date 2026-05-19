"use strict";

// sync-media-preview — locate per-component capture frames in Figma, render
// them as PNGs via REST /v1/images, save under
// components/dist/media/<slug>/<role>.png.
// First instance of the media convention (paths-manifest.json#components.media.ci).
//
// Naming convention (data side):
//   `preview`, `parts`, `variations`, `spacing` — DS asset naming. "Overview"
//   is reserved for sections + tabs.
//
// Naming convention (Figma side, post-2026-05-19 rename):
//   Each component page has an outer FRAME named "Design guidelines" that
//   wraps 7 (today) sub-section FRAMES. Pre-rename: all 7 are also named
//   "Design guidelines". Post-rename: "Preview", "Parts", "Variations",
//   "Spacing", "Behavior", "Layout", "When to use". The data-side speaks
//   the role keys; ROLE_FINDERS maps role → Figma sub-section name.
//
// Capture: inside each sub-section, take the FIRST FRAME child (skipping
// TEXT/INSTANCE header layers). That's the visual.
//
// Page resolution: built from registry.components[slug].page (the page name
// like "✍️ Button"), NOT by walking the file tree. Component frames live
// 3+ levels deep on their pages — too deep to walk reliably; the registry
// already knows where each component sits.
//
// Pipeline:
//   1. getFile(fileKey, { depth: 2 }) — enumerate pages, build name→id map.
//   2. Map each registered slug → page id via registry.page name.
//   3. getNodes(uniquePageIds) — fetch full subtrees of relevant pages only.
//   4. For each page, find the outer "Design guidelines" wrapper; for each
//      role in ROLE_FINDERS, find the sub-section FRAME by name; take the
//      first FRAME child inside that sub-section as the source node.
//   5. getImages(uniqueSourceIds, png, scale=2) — one batched call.
//   6. fetchBinary + writeIfChanged — buffer cache per sourceNodeId so
//      multiple slugs on the same page share one download.

var fs = require("fs");
var path = require("path");

// Outer wrapper frame name (stays "Design guidelines" — the section header
// designers see). This is the layer that contains all sub-sections.
var OUTER_WRAPPER_NAME = "Design guidelines";

// ROLE_FINDERS — per-role configuration. `sectionName` is the FRAME name of
// the sub-section inside the outer wrapper, post-rename. Adding a role:
// add a config entry here AND ensure designers have renamed the matching
// sub-section frame in Figma.
//
// Multi-image roles (Parts has 6 inner visuals, Variations has 2) are
// future work — when those roles land, this map gains a `capture: "all"`
// field, the schema's `media.<role>` becomes `string[]`, and consumers
// (docs MediaAsset) update. Today only `preview` is active.
var ROLE_FINDERS = {
  preview: { sectionName: "Preview" },
  // Future:
  // parts:      { sectionName: "Parts",      capture: "all" },
  // variations: { sectionName: "Variations", capture: "all" },
  // spacing:    { sectionName: "Spacing" },
};

// Recursive case-insensitive frame-by-name finder. Returns the matching FRAME
// node or null. Walks the entire subtree under `node`. Used to locate the
// outer "Design guidelines" wrapper anywhere on a page (it usually sits as
// a direct child of the CANVAS but the finder is resilient to deeper nesting).
function findFrameByNameRecursive(node, name) {
  if (!node) return null;
  var lcName = name.toLowerCase();
  if (
    node.type === "FRAME" &&
    typeof node.name === "string" &&
    node.name.toLowerCase() === lcName
  ) {
    return node;
  }
  if (!Array.isArray(node.children)) return null;
  for (var i = 0; i < node.children.length; i++) {
    var found = findFrameByNameRecursive(node.children[i], name);
    if (found) return found;
  }
  return null;
}

// findRoleSourceNode — given a page subtree and a role-finder spec, locate
// the outer "Design guidelines" wrapper, find the sub-section FRAME by name,
// then return the id of the FIRST FRAME child of the sub-section (the visual).
// All matches are case-insensitive.
function findRoleSourceNode(pageNode, findSpec) {
  var doc = pageNode && pageNode.document ? pageNode.document : pageNode;
  if (!doc) return null;
  var wrapper = findFrameByNameRecursive(doc, OUTER_WRAPPER_NAME);
  if (!wrapper || !Array.isArray(wrapper.children)) return null;
  var lcSection = findSpec.sectionName.toLowerCase();
  for (var i = 0; i < wrapper.children.length; i++) {
    var sub = wrapper.children[i];
    if (!sub || sub.type !== "FRAME" || typeof sub.name !== "string") continue;
    if (sub.name.toLowerCase() !== lcSection) continue;
    // Found the sub-section. Capture the FIRST FRAME child (the visual);
    // skip TEXT, INSTANCE, GROUP, etc. layers that may sit above the visual
    // (typically a title TEXT element).
    if (!Array.isArray(sub.children)) return null;
    for (var j = 0; j < sub.children.length; j++) {
      var inner = sub.children[j];
      if (inner && inner.type === "FRAME") return inner.id;
    }
    // Sub-section has no FRAME child — capture the sub-section itself as a
    // last resort. Should be rare; flag in callsite logs if needed later.
    return sub.id;
  }
  return null;
}

function writeIfChanged(absPath, bytes) {
  if (fs.existsSync(absPath)) {
    var existing = fs.readFileSync(absPath);
    if (existing.length === bytes.length && existing.equals(bytes))
      return false;
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, bytes);
  return true;
}

async function run(opts) {
  if (!opts || !opts.registry)
    throw new Error("sync-media-preview: opts.registry required");
  if (!opts.outputDir)
    throw new Error("sync-media-preview: opts.outputDir required");
  if (!opts.rest) throw new Error("sync-media-preview: opts.rest required");

  var rest = opts.rest;
  var fileKey = opts.registry.fileKey;
  var components = opts.registry.components || {};
  var slugs = Object.keys(components);
  var roleNames = Object.keys(ROLE_FINDERS);

  if (slugs.length === 0 || roleNames.length === 0) {
    return { captured: [], missing: [], skipped: [] };
  }

  // Step 1: enumerate pages (depth=2 — just CANVAS list + their direct
  // children for sanity; we only use the page-name map).
  var fileResp = await rest.getFile(fileKey, { depth: 2 });
  var fileDoc = fileResp && fileResp.document;
  if (!fileDoc || !Array.isArray(fileDoc.children)) {
    return {
      captured: [],
      missing: aggregateMissing(allPairs(slugs, roleNames)).sort(),
      skipped: [],
    };
  }
  // Whitespace normalization: Figma page names sometimes carry leading or
  // trailing whitespace (e.g. "     ✍️ Button" — designer padding for
  // visual sorting in the pages panel). The registry transformer trims
  // these before storing `page` on each component, so an exact-match
  // lookup would miss every padded page. Normalize both sides so the
  // comparison is whitespace-agnostic. Discovered when the first real
  // media-preview sync run captured 0 of N components (2026-05-19).
  var pageNameToId = {};
  fileDoc.children.forEach(function (p) {
    if (p && p.name && p.id) pageNameToId[String(p.name).trim()] = p.id;
  });

  // Step 2: map slug → pageId via registry.page name.
  var slugToPageId = {};
  var unresolvedSlugs = [];
  slugs.forEach(function (slug) {
    var c = components[slug];
    if (!c || !c.page) {
      unresolvedSlugs.push(slug);
      return;
    }
    var pid = pageNameToId[String(c.page).trim()];
    if (pid) slugToPageId[slug] = pid;
    else unresolvedSlugs.push(slug);
  });

  var uniquePageIds = Array.from(new Set(Object.values(slugToPageId)));
  if (uniquePageIds.length === 0) {
    return {
      captured: [],
      missing: aggregateMissing(allPairs(unresolvedSlugs, roleNames)).sort(),
      skipped: [],
    };
  }

  // Step 3: fetch full subtrees for relevant pages only.
  var nodesResp = await rest.getNodes(fileKey, uniquePageIds);
  var nodes = (nodesResp && nodesResp.nodes) || {};

  // Step 4: for each page, find role-source frames once. Then assign each
  // (slug, role) to its page's matching source.
  // pageRoleSources[pageId][role] = sourceNodeId
  var pageRoleSources = {};
  uniquePageIds.forEach(function (pageId) {
    var page = nodes[pageId];
    pageRoleSources[pageId] = {};
    if (!page) return;
    roleNames.forEach(function (role) {
      var srcId = findRoleSourceNode(page, ROLE_FINDERS[role]);
      if (srcId) pageRoleSources[pageId][role] = srcId;
    });
  });

  var pending = []; // [{ slug, role, sourceNodeId }]
  var missingPairs = unresolvedSlugs.flatMap(function (s) {
    return roleNames.map(function (r) {
      return { slug: s, role: r };
    });
  });
  Object.keys(slugToPageId).forEach(function (slug) {
    var pid = slugToPageId[slug];
    var sources = pageRoleSources[pid] || {};
    roleNames.forEach(function (role) {
      if (sources[role])
        pending.push({ slug: slug, role: role, sourceNodeId: sources[role] });
      else missingPairs.push({ slug: slug, role: role });
    });
  });

  if (pending.length === 0) {
    return {
      captured: [],
      missing: aggregateMissing(missingPairs).sort(),
      skipped: [],
    };
  }

  // Step 5: getImages over unique source ids.
  var uniqueIds = Array.from(
    new Set(
      pending.map(function (p) {
        return p.sourceNodeId;
      }),
    ),
  );
  var imagesResp = await rest.getImages(fileKey, uniqueIds, {
    format: "png",
    scale: 2,
  });
  var urlMap = (imagesResp && imagesResp.images) || {};

  // Step 6: download + write. Buffer cache keyed by sourceNodeId.
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

function allPairs(slugList, roleList) {
  var out = [];
  slugList.forEach(function (s) {
    roleList.forEach(function (r) {
      out.push({ slug: s, role: r });
    });
  });
  return out;
}

// aggregateMissing — collapse (slug, role) pairs into slug-only entries when
// ALL roles are missing for a slug; otherwise emit one "slug:role" entry per
// missing role. Keeps the changelog readable for partial captures.
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
    var roles = byslug[slug];
    if (roles.length === totalRoles) result.push(slug);
    else
      roles.forEach(function (r) {
        result.push(slug + ":" + r);
      });
  });
  return result;
}

module.exports = {
  run: run,
  findRoleSourceNode: findRoleSourceNode,
  findFrameByNameRecursive: findFrameByNameRecursive,
  ROLE_FINDERS: ROLE_FINDERS,
  OUTER_WRAPPER_NAME: OUTER_WRAPPER_NAME,
};
