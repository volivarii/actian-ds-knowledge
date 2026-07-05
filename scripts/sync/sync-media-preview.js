"use strict";

// sync-media-preview — locate per-component capture frames in Figma, render
// them as PNGs via REST /v1/images, convert to WebP, and save under
// components/dist/media/<slug>/<role>.webp. (Figma's REST API has no WebP
// format, so we fetch PNG and transcode locally — WebP is ~60-80% smaller
// for these downscaled UI screenshots.)
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
var sharp = require("sharp");

// On-disk extension for captured media. The pre-WebP era used ".png" — see
// pruneLegacyPng for the one-time cleanup of those.
var MEDIA_EXT = ".webp";

// encodeWebp — transcode a PNG buffer (as returned by the Figma /v1/images
// endpoint) to a WebP buffer. q80 lossy is visually lossless for these
// scale=2 screenshots, which render downscaled in the docs.
function encodeWebp(pngBuf) {
  return sharp(pngBuf).webp({ quality: 80 }).toBuffer();
}

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
// A finder may declare `sectionName` (one name) OR `sectionNames` (several
// aliases). The `parts` board was renamed in Figma — different components now
// label it "Parts & tokens" or "Anatomy" rather than the original "Parts" —
// so its finder lists every alias it may carry. Matching is case-insensitive;
// the per-page diagnostic log (below) surfaces any further rename so the alias
// list can be extended without guesswork.
var ROLE_FINDERS = {
  preview: { sectionName: "Preview", capture: "first" },
  parts: {
    sectionNames: ["Parts", "Parts & tokens", "Anatomy"],
    capture: "all",
  },
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
  // Accept one name (`sectionName`) or several aliases (`sectionNames`),
  // case-insensitive. A role matches the first sub-section whose name is in
  // the set, so the post-rename "Parts & tokens"/"Anatomy" resolve the same
  // `parts` board the original "Parts" did.
  var names = Array.isArray(findSpec.sectionNames)
    ? findSpec.sectionNames
    : [findSpec.sectionName];
  var lcSections = names
    .filter(function (n) {
      return typeof n === "string";
    })
    .map(function (n) {
      return n.toLowerCase();
    });
  var mode = findSpec.capture || "first";
  for (var i = 0; i < wrapper.children.length; i++) {
    var sub = wrapper.children[i];
    if (!sub || sub.type !== "FRAME" || typeof sub.name !== "string") continue;
    if (lcSections.indexOf(sub.name.toLowerCase()) === -1) continue;
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

// wrapperSubsectionNames — the FRAME sub-section names directly under a page's
// "Design guidelines" wrapper (or [] when the wrapper is absent). Diagnostic
// only: logged per run so a silent Figma section rename (which would otherwise
// just zero out a role's capture) is visible in the run output.
function wrapperSubsectionNames(pageNode) {
  var doc = pageNode && pageNode.document ? pageNode.document : pageNode;
  var wrapper = doc ? findFrameByNameRecursive(doc, OUTER_WRAPPER_NAME) : null;
  if (!wrapper || !Array.isArray(wrapper.children)) return [];
  return wrapper.children
    .filter(function (c) {
      return c && c.type === "FRAME" && typeof c.name === "string";
    })
    .map(function (c) {
      return c.name;
    });
}

// mediaFilename — compute the output filename for a captured image.
// capture:"first" roles (e.g. preview) → preview.webp
// capture:"all" roles  (e.g. parts)    → parts-0.webp, parts-1.webp, …
function mediaFilename(role, index) {
  var cfg = ROLE_FINDERS[role];
  return cfg && cfg.capture === "all"
    ? role + "-" + index + MEDIA_EXT
    : role + MEDIA_EXT;
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
    // Diagnostic: the actual sub-section names under this page's "Design
    // guidelines" wrapper. A silent rename (e.g. "Parts" → "Parts & tokens")
    // shows up here, so a role that captures 0 frames is never opaque.
    var doc0 = page.document || page;
    console.log(
      "[media-preview] " +
        (doc0 && doc0.name ? doc0.name : pageId) +
        " — sections: " +
        JSON.stringify(wrapperSubsectionNames(page)),
    );
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
    var earlyPrune = pruneStaleCaptures(opts.outputDir, countMap);
    pruneLegacyPng(opts.outputDir);
    return {
      captured: [],
      missing: aggregateMissing(missingPairs).sort(),
      skipped: skippedSlugs,
      pruneRefused: earlyPrune.refused,
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
    // bufferCache stores the converted WebP buffer keyed by sourceNodeId, so
    // a source node shared across slugs is fetched AND transcoded only once.
    var bytes = bufferCache[p.sourceNodeId];
    if (!bytes) {
      var png = await rest.fetchBinary(signedUrl);
      bytes = await encodeWebp(png);
      bufferCache[p.sourceNodeId] = bytes;
    }
    var filename = mediaFilename(p.role, p.index);
    var outPath = path.join(opts.outputDir, p.slug, filename);
    writeIfChanged(outPath, bytes);
    // Captured key: slug/role for first, slug/role-N for multi. Derived
    // from mediaFilename so the filename contract is defined in one place.
    var basename = filename.slice(0, -MEDIA_EXT.length);
    var capturedKey = p.slug + "/" + basename;
    captured.push(capturedKey);
  }

  // Step 7: prune stale multi-image files from processed slug dirs.
  // Must run after writes so surviving files are already in place.
  var prune = pruneStaleCaptures(opts.outputDir, countMap);
  pruneLegacyPng(opts.outputDir);

  return {
    captured: captured.sort(),
    missing: aggregateMissing(missingPairs).sort(),
    skipped: skippedSlugs,
    pruneRefused: prune.refused,
  };
}

// pruneStaleCaptures — for every processed slug and every capture:"all" role,
// delete any <role>-<n>.webp where n >= N (the count of frames captured this
// run). N = 0 means the role was fully absent — all its files are removed.
// capture:"first" roles (like "preview") are single-file and not pruned.
//
// Mass-prune guard: a role resolving to ZERO frames on MANY slugs at once is
// the signature of a library-wide sub-section rename outside the alias list
// (finder broken), not of many simultaneous legitimate removals. Deleting on
// that signal would wipe every <role>-*.webp across the library inside an
// auto-merged PR. When more than MAX_ZERO_PRUNE_SLUGS slugs would lose their
// ENTIRE role in one run, the zero-count prune for that role is refused
// (files preserved, refusal returned so the sync changelog can warn).
// Shrink prunes (N > 0) are unaffected. A deliberate library-wide role
// retirement must be executed manually (or by raising the constant).
var MAX_ZERO_PRUNE_SLUGS = 3;

function pruneStaleCaptures(outputDir, countMap) {
  var refused = [];
  var multiRoles = Object.keys(ROLE_FINDERS).filter(function (role) {
    return ROLE_FINDERS[role].capture === "all";
  });
  if (multiRoles.length === 0) return { refused: refused };

  // Pass 1: per role, which slugs would lose their ENTIRE capture set (N=0
  // with existing files on disk)?
  var zeroBySlugs = {};
  multiRoles.forEach(function (role) {
    zeroBySlugs[role] = [];
  });
  Object.keys(countMap).forEach(function (slug) {
    var slugDir = path.join(outputDir, slug);
    if (!fs.existsSync(slugDir)) return;
    var entries;
    try {
      entries = fs.readdirSync(slugDir);
    } catch (_) {
      return;
    }
    multiRoles.forEach(function (role) {
      if ((countMap[slug][role] || 0) !== 0) return;
      var prefix = role + "-";
      var hasFiles = entries.some(function (file) {
        return file.startsWith(prefix) && file.endsWith(MEDIA_EXT);
      });
      if (hasFiles) zeroBySlugs[role].push(slug);
    });
  });
  var refusedRoles = {};
  multiRoles.forEach(function (role) {
    if (zeroBySlugs[role].length > MAX_ZERO_PRUNE_SLUGS) {
      refusedRoles[role] = true;
      refused.push({ role: role, slugs: zeroBySlugs[role] });
      console.warn(
        "[media-preview] REFUSED zero-count prune for role '" +
          role +
          "': " +
          zeroBySlugs[role].length +
          " slugs would lose every " +
          role +
          "-*.webp (sub-section rename suspected). Files preserved.",
      );
    }
  });

  // Pass 2: delete, honoring the refusals.
  Object.keys(countMap).forEach(function (slug) {
    var slugDir = path.join(outputDir, slug);
    if (!fs.existsSync(slugDir)) return;
    var roleCounts = countMap[slug];
    multiRoles.forEach(function (role) {
      var n = roleCounts[role] || 0;
      if (n === 0 && refusedRoles[role]) return;
      var entries;
      try {
        entries = fs.readdirSync(slugDir);
      } catch (_) {
        return;
      }
      var prefix = role + "-";
      entries.forEach(function (file) {
        if (!file.startsWith(prefix) || !file.endsWith(MEDIA_EXT)) return;
        // strip the "<role>-" prefix and the extension to get the index
        var idxStr = file.slice(prefix.length, -MEDIA_EXT.length);
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
  return { refused: refused };
}

// pruneLegacyPng — one-time migration cleanup: delete any *.png left under
// the media tree from the pre-WebP era. capture:"first" files like
// preview.png are not covered by pruneStaleCaptures, so this sweeps every
// slug dir. Idempotent — a no-op once the tree is fully WebP.
function pruneLegacyPng(outputDir) {
  var slugs;
  try {
    slugs = fs.readdirSync(outputDir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  slugs.forEach(function (slugEnt) {
    if (!slugEnt.isDirectory()) return;
    var slugDir = path.join(outputDir, slugEnt.name);
    var files;
    try {
      files = fs.readdirSync(slugDir);
    } catch (_) {
      return;
    }
    files.forEach(function (file) {
      if (!file.endsWith(".png")) return;
      try {
        fs.unlinkSync(path.join(slugDir, file));
      } catch (_) {
        // Best-effort; ignore if already gone.
      }
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
  wrapperSubsectionNames: wrapperSubsectionNames,
  encodeWebp: encodeWebp,
  ROLE_FINDERS: ROLE_FINDERS,
  OUTER_WRAPPER_NAME: OUTER_WRAPPER_NAME,
};
