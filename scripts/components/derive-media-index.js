"use strict";

// derive-media-index — builds components/dist/media/_index.json from the
// per-slug media directories under components/dist/media/<slug>/<role>.<ext>.
//
// Why a separate index from the guideline-doc media field:
//   Media files exist for every component whose page has a `Preview` (and
//   future `Parts`/`Variations`/`Spacing`) frame in Figma. That's a SUPERSET
//   of components with authored guideline content — e.g. `avatar` and many
//   other DS components have media but no guideline doc. Conflating media
//   availability with guideline coverage made those unrelated components
//   invisible to docs consumers (the docs MediaAsset rendered nothing
//   despite the PNG existing on disk).
//
// This index decouples the two layers:
//   - Media SoT: the directory layout under components/dist/media/<slug>/.
//   - Index: a slug → role-map snapshot consumers read instead of scanning
//     the filesystem. Resolves via paths-manifest.json#components.media.index.
//
// Idempotent: byte-stable output for a given filesystem state (sorted keys,
// no timestamps). Skip-on-no-change semantics avoid noise on CI re-runs.

var fs = require("node:fs");
var path = require("node:path");

// MEDIA_ROLES: role key → filename basename. Mirrors the source-of-truth
// map in scripts/sync/sync-media-preview.js#ROLE_FINDERS. Adding a future
// role means adding an entry in BOTH places (sync to capture, index to
// enumerate). The duplication is intentional: each side describes a
// different half of the contract (Figma source name vs. on-disk basename).
var MEDIA_ROLES = {
  preview: "preview.png",
  // parts: "parts.png",            // multi-image — future
  // variations: "variations.png",  // multi-image — future
  // spacing: "spacing.png",
};

// Per-slug derive: scan a slug's media dir for known role basenames; return
// a role-keyed map of repo-relative paths, or null when the slug has none.
function deriveSlugMedia(mediaRoot, slug) {
  var dir = path.join(mediaRoot, slug);
  if (!fs.existsSync(dir)) return null;
  var map = {};
  Object.keys(MEDIA_ROLES).forEach(function (role) {
    var basename = MEDIA_ROLES[role];
    var p = path.join(dir, basename);
    if (fs.existsSync(p)) {
      map[role] = "components/dist/media/" + slug + "/" + basename;
    }
  });
  return Object.keys(map).length > 0 ? map : null;
}

// buildMediaIndex — pure derivation from the media dir contents. Returns the
// JSON object that gets written to _index.json. Sorted keys for byte stability.
function buildMediaIndex(mediaRoot) {
  if (!fs.existsSync(mediaRoot)) {
    return null;
  }
  var entries = fs.readdirSync(mediaRoot, { withFileTypes: true });
  var media = {};
  entries.forEach(function (e) {
    if (!e.isDirectory()) return;
    var slug = e.name;
    var slugMap = deriveSlugMedia(mediaRoot, slug);
    if (slugMap) media[slug] = slugMap;
  });
  var sorted = {};
  Object.keys(media).sort().forEach(function (k) {
    sorted[k] = media[k];
  });
  return {
    _schema_version: 1,
    _meta: {
      auto_generated: true,
      source: "components/dist/media/",
      do_not_edit:
        "Edit via scripts/sync/sync-media-* phases; CI regenerates this file.",
    },
    media: sorted,
  };
}

// writeMediaIndex — driver that writes the index to disk at the canonical
// location. Returns { wrote, path, slugCount }. No-op when the media root
// doesn't exist (keeps the deriver portable for non-knowledge consumers).
function writeMediaIndex(repoRoot) {
  var mediaRoot = path.join(repoRoot, "components", "dist", "media");
  if (!fs.existsSync(mediaRoot)) {
    return { wrote: false, path: null, slugCount: 0 };
  }
  var indexPath = path.join(mediaRoot, "_index.json");
  var index = buildMediaIndex(mediaRoot);
  var nextStr = JSON.stringify(index, null, 2) + "\n";
  var currentStr = fs.existsSync(indexPath)
    ? fs.readFileSync(indexPath, "utf8")
    : "";
  var slugCount = Object.keys(index.media).length;
  if (currentStr === nextStr) {
    return { wrote: false, path: indexPath, slugCount: slugCount };
  }
  fs.writeFileSync(indexPath, nextStr, "utf8");
  return { wrote: true, path: indexPath, slugCount: slugCount };
}

module.exports = {
  buildMediaIndex: buildMediaIndex,
  writeMediaIndex: writeMediaIndex,
  deriveSlugMedia: deriveSlugMedia,
  MEDIA_ROLES: MEDIA_ROLES,
};
