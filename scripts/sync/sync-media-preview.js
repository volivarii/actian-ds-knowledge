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

// Collection categories have no per-component "Design guidelines" page in
// Figma, so no capture frames exist. Excluding them keeps them out of
// `missing` (234 Icons would otherwise swamp the changelog).
var EXCLUDED_CATEGORIES = new Set(["Icons"]);

// ROLE_FINDERS — per-role configuration. `sectionName` is the FRAME name of
// the sub-section inside the outer wrapper, post-rename. Adding a role:
// add a config entry here AND ensure designers have renamed the matching
// sub-section frame in Figma.
//
// `capture: "first"` (default) — one image per role, written as <role>.png.
// `capture: "all"` — one image per FRAME child, written as <role>-<index>.png.
var ROLE_FINDERS = {
  preview: { sectionName: "Preview", capture: "first" },
  parts: { sectionName: "Parts", capture: "all" },
  variations: { sectionName: "Variations", capture: "all" },
  spacing: { sectionName: "Spacing", capture: "all" },
  behavior: { sectionName: "Behavior", capture: "all" },
  layout: { sectionName: "Layout", capture: "all" },
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
// then return:
//   capture:"first" (default) — the id of the FIRST FRAME child (a string).
//   capture:"all"             — an array of ids of ALL FRAME children, in
//                               Figma child order (skipping non-FRAME layers).
// All name matches are case-insensitive.
function findRoleSourceNode(pageNode, findSpec) {
  var doc = pageNode && pageNode.document ? pageNode.document : pageNode;
  if (!doc) return null;
  var wrapper = findFrameByNameRecursive(doc, OUTER_WRAPPER_NAME);
  if (!wrapper || !Array.isArray(wrapper.children)) return null;
  var lcSection = findSpec.sectionName.toLowerCase();
  var mode = findSpec.capture || "first";
  for (var i = 0; i < wrapper.children.length; i++) {
    var sub = wrapper.children[i];
    if (!sub || sub.type !== "FRAME" || typeof sub.name !== "string") continue;
    if (sub.name.toLowerCase() !== lcSection) continue;
    if (!Array.isArray(sub.children)) return null;
    var frameIds = sub.children
      .filter(function (c) {
        return c && c.type === "FRAME";
      })
      .map(function (c) {
        return c.id;
      });
    if (frameIds.length === 0) {
      // No FRAME child — fall back to the sub-section itself.
      return mode === "all" ? [sub.id] : sub.id;
    }
    return mode === "all" ? frameIds : frameIds[0];
  }
  return null;
}

// mediaFilename — compute the output filename for a captured image.
// capture:"first" roles (e.g. preview) → preview.png
// capture:"all" roles  (e.g. parts)    → parts-0.png, parts-1.png, …
function mediaFilename(role, index) {
  var cfg = ROLE_FINDERS[role];
  return cfg && cfg.capture === "all"
    ? role + "-" + index + ".png"
    : role + ".png";
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

  var skippedSlugs = [];
  var captureSlugs = [];
  slugs.forEach(function (slug) {
    var c = components[slug];
    // A component with no `category` field has `c.category === undefined`,
    // which `EXCLUDED_CATEGORIES.has(undefined)` returns `false` for — so
    // uncategorized components fall through to captureSlugs and ARE captured,
    // not skipped. This is intentional; don't "fix" it.
    if (c && EXCLUDED_CATEGORIES.has(c.category)) skippedSlugs.push(slug);
    else captureSlugs.push(slug);
  });
  skippedSlugs.sort();

  if (captureSlugs.length === 0 || roleNames.length === 0) {
    return { captured: [], missing: [], skipped: skippedSlugs };
  }

  // Step 1: enumerate pages (depth=2 — just CANVAS list + their direct
  // children for sanity; we only use the page-name map).
  var fileResp = await rest.getFile(fileKey, { depth: 2 });
  var fileDoc = fileResp && fileResp.document;
  if (!fileDoc || !Array.isArray(fileDoc.children)) {
    return {
      captured: [],
      missing: aggregateMissing(allPairs(captureSlugs, roleNames)).sort(),
      skipped: skippedSlugs,
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
  captureSlugs.forEach(function (slug) {
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
      skipped: skippedSlugs,
    };
  }

  // Step 3: fetch full subtrees for relevant pages only.
  var nodesResp = await rest.getNodes(fileKey, uniquePageIds);
  var nodes = (nodesResp && nodesResp.nodes) || {};

  // Step 4: for each page, find role-source frames once. Then expand each
  // (slug, role) result into one pending entry per image:
  //   capture:"first" → one entry, index 0.
  //   capture:"all"   → one entry per FRAME child id, index 0…N-1.
  // pageRoleSources[pageId][role] = string | string[]
  var pageRoleSources = {};
  uniquePageIds.forEach(function (pageId) {
    var page = nodes[pageId];
    pageRoleSources[pageId] = {};
    if (!page) return;
    roleNames.forEach(function (role) {
      var src = findRoleSourceNode(page, ROLE_FINDERS[role]);
      if (src) pageRoleSources[pageId][role] = src;
    });
  });

  // pending entries: [{ slug, role, index, sourceNodeId }]
  // index is position within the role (always 0 for capture:"first").
  var pending = [];
  var missingPairs = unresolvedSlugs.flatMap(function (s) {
    return roleNames.map(function (r) {
      return { slug: s, role: r };
    });
  });
  Object.keys(slugToPageId).forEach(function (slug) {
    var pid = slugToPageId[slug];
    var sources = pageRoleSources[pid] || {};
    roleNames.forEach(function (role) {
      var src = sources[role];
      if (!src) {
        missingPairs.push({ slug: slug, role: role });
        return;
      }
      // Normalise to array so the loop below is uniform.
      var ids = Array.isArray(src) ? src : [src];
      ids.forEach(function (nodeId, idx) {
        pending.push({
          slug: slug,
          role: role,
          index: idx,
          sourceNodeId: nodeId,
        });
      });
    });
  });

  // Build a count map: (slug, role) → N images captured this run.
  // Slugs that ARE in slugToPageId are "processed" even when a role resolves
  // to 0 frames (those produce no pending entries, so countMap[slug][role] = 0
  // after initialization). This drives the "fully-removed role" prune case.
  var countMap = {};
  Object.keys(slugToPageId).forEach(function (slug) {
    countMap[slug] = {};
    roleNames.forEach(function (role) {
      countMap[slug][role] = 0;
    });
  });
  pending.forEach(function (p) {
    if (countMap[p.slug])
      countMap[p.slug][p.role] = (countMap[p.slug][p.role] || 0) + 1;
  });

  if (pending.length === 0) {
    // Still need to prune stale files even when there is nothing new to write.
    pruneStaleCaptures(opts.outputDir, countMap);
    return {
      captured: [],
      missing: aggregateMissing(missingPairs).sort(),
      skipped: skippedSlugs,
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

  // Step 6: download + write. Buffer cache keyed by sourceNodeId so multiple
  // slugs sharing a page source pay only one fetchBinary call.
  var captured = [];
  var bufferCache = {};
  // alreadyMissing — guard so each (slug, role) pair is recorded in
  // missingPairs at most once even when a capture:"all" role expands into
  // N pending entries that all share an unresolved source id.
  var alreadyMissing = {};
  for (var i = 0; i < pending.length; i++) {
    var p = pending[i];
    var signedUrl = urlMap[p.sourceNodeId];
    if (!signedUrl) {
      var missKey = p.slug + ":" + p.role;
      if (!alreadyMissing[missKey]) {
        alreadyMissing[missKey] = true;
        missingPairs.push({ slug: p.slug, role: p.role });
      }
      continue;
    }
    var bytes = bufferCache[p.sourceNodeId];
    if (!bytes) {
      bytes = await rest.fetchBinary(signedUrl);
      bufferCache[p.sourceNodeId] = bytes;
    }
    var filename = mediaFilename(p.role, p.index);
    var outPath = path.join(opts.outputDir, p.slug, filename);
    writeIfChanged(outPath, bytes);
    // Captured key: slug/role for first, slug/role-N for multi. Derived
    // from mediaFilename so the filename contract is defined in one place.
    var basename = filename.replace(/\.png$/, "");
    var capturedKey = p.slug + "/" + basename;
    captured.push(capturedKey);
  }

  // Step 7: prune stale multi-image files from processed slug dirs.
  // Must run after writes so surviving files are already in place.
  pruneStaleCaptures(opts.outputDir, countMap);

  return {
    captured: captured.sort(),
    missing: aggregateMissing(missingPairs).sort(),
    skipped: skippedSlugs,
  };
}

// pruneStaleCaptures — for every processed slug and every capture:"all" role,
// delete any <role>-<n>.png where n >= N (the count of frames captured this
// run). N = 0 means the role was fully absent — all its files are removed.
// capture:"first" roles (like "preview") are single-file and not pruned.
function pruneStaleCaptures(outputDir, countMap) {
  var multiRoles = Object.keys(ROLE_FINDERS).filter(function (role) {
    return ROLE_FINDERS[role].capture === "all";
  });
  if (multiRoles.length === 0) return;

  Object.keys(countMap).forEach(function (slug) {
    var slugDir = path.join(outputDir, slug);
    if (!fs.existsSync(slugDir)) return;
    var roleCounts = countMap[slug];
    multiRoles.forEach(function (role) {
      var n = roleCounts[role] || 0;
      var entries;
      try {
        entries = fs.readdirSync(slugDir);
      } catch (_) {
        return;
      }
      var prefix = role + "-";
      entries.forEach(function (file) {
        if (!file.startsWith(prefix) || !file.endsWith(".png")) return;
        var idxStr = file.slice(prefix.length, -4); // strip "<role>-" prefix and ".png"
        var idx = parseInt(idxStr, 10);
        if (isNaN(idx) || idx < 0) return;
        if (idx >= n) {
          try {
            fs.unlinkSync(path.join(slugDir, file));
          } catch (_) {
            // Best-effort; ignore if already gone.
          }
        }
      });
    });
  });
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
