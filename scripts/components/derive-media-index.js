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

// On-disk extension for captured media — must match MEDIA_EXT in
// sync-media-preview.js (the side that writes the files).
var MEDIA_EXT = ".webp";

// MEDIA_ROLES: role key → { basename, multi }. preview is single (bare string);
// the five Bucket-C roles are multi-image (parts-0.webp, parts-1.webp, …) and
// emit ordered string[]. Mirrors ROLE_FINDERS in sync-media-preview.js.
// Adding a role means adding an entry HERE (to enumerate) AND on the capture
// side (to write the files). The capture half lives in sync-media-preview.js
// (ROLE_FINDERS, section-frame roles) OR in a dedicated sync-media-<role>.js
// phase — e.g. the `default` role's capture lives in sync-media-default.js.
// The duplication is intentional: each side describes a different half of the
// contract (Figma source name vs. on-disk basename).
var MEDIA_ROLES = {
  preview: { basename: "preview", multi: false },
  parts: { basename: "parts", multi: true },
  variations: { basename: "variations", multi: true },
  spacing: { basename: "spacing", multi: true },
  behavior: { basename: "behavior", multi: true },
  layout: { basename: "layout", multi: true },
  default: { basename: "default", multi: false },
};

// Per-slug derive: scan a slug's media dir for known role basenames; return
// a role-keyed map of repo-relative paths, or null when the slug has none.
function deriveSlugMedia(mediaRoot, slug) {
  var dir = path.join(mediaRoot, slug);
  if (!fs.existsSync(dir)) return null;
  var rel = function (file) {
    return "components/dist/media/" + slug + "/" + file;
  };
  var map = {};
  Object.keys(MEDIA_ROLES).forEach(function (role) {
    var spec = MEDIA_ROLES[role];
    if (!spec.multi) {
      var single = spec.basename + MEDIA_EXT;
      if (fs.existsSync(path.join(dir, single))) map[role] = rel(single);
      return;
    }
    var imgs = [];
    for (var i = 0; ; i++) {
      var file = spec.basename + "-" + i + MEDIA_EXT;
      if (!fs.existsSync(path.join(dir, file))) break;
      imgs.push(rel(file));
    }
    if (imgs.length > 0) map[role] = imgs;
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
  Object.keys(media)
    .sort()
    .forEach(function (k) {
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
  return writeMediaIndexAt(path.join(repoRoot, "components", "dist", "media"));
}

// writeMediaIndexAt — same derive, addressed by the media root itself. For
// callers that already hold the media dir (e.g. the sync orchestrator's
// mediaOutputDir), so no repo-root shape inference is needed.
function writeMediaIndexAt(mediaRoot) {
  if (!fs.existsSync(mediaRoot)) {
    return { wrote: false, path: null, slugCount: 0 };
  }
  var indexPath = path.join(mediaRoot, "_index.json");
  var index = buildMediaIndex(mediaRoot);
  var nextStr = JSON.stringify(index, null, 2) + "\n";
  var currentStr = fs.existsSync(indexPath)
    ? fs.readFileSync(indexPath, "utf8")
    : "";
  // Return the PRIOR index, not just its bytes. buildMediaIndex is a pure
  // directory listing with no memory, so without this the caller cannot tell 60
  // slugs disappearing from 60 slugs appearing: both are simply "wrote: true".
  // The sync's verdict needs the before-set to call a loss what it is.
  var before = null;
  if (currentStr) {
    try {
      before = JSON.parse(currentStr);
    } catch (e) {
      // A corrupt index must not silently degrade to an empty "before", which
      // would make every entry look newly gained and report the sync additive.
      throw new Error(
        "derive-media-index: " + indexPath + " is unparseable: " + e.message,
      );
    }
  }
  var slugCount = Object.keys(index.media).length;
  if (currentStr === nextStr) {
    return {
      wrote: false,
      path: indexPath,
      slugCount: slugCount,
      before: before,
      after: index,
    };
  }
  fs.writeFileSync(indexPath, nextStr, "utf8");
  return {
    wrote: true,
    path: indexPath,
    slugCount: slugCount,
    before: before,
    after: index,
  };
}

module.exports = {
  buildMediaIndex: buildMediaIndex,
  writeMediaIndex: writeMediaIndex,
  writeMediaIndexAt: writeMediaIndexAt,
  deriveSlugMedia: deriveSlugMedia,
  MEDIA_ROLES: MEDIA_ROLES,
};
