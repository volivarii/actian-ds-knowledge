"use strict";

// Whether a slug rename can be absorbed, i.e. whether calling it additive will
// produce a PR that can actually merge.
//
// WHY THIS EXISTS
//
// components/dist/identity.json makes RESOLUTION survive a rename: a consumer
// holding the old slug still resolves. It does NOT make authored references
// correct, and several authored files are keyed by slug:
//
//   ds-html-map.js has `case "sticky-footer":`, which must become
//   `case "action-bar":` by hand. Teaching a gate to tolerate it would ship a
//   renderer that cannot draw the new slug.
//
//   app-context patterns list slugs in `components[]`, and derive-graph THROWS
//   on a reference matching no registry key rather than dropping the edge.
//
// So an additive verdict on such a rename opens an auto-merge-enabled PR whose
// required checks can never go green. That is strictly WORSE than the breaking
// path it replaces, because a breaking verdict produces a rolling tracking issue
// that a human acts on.
//
// 🪤 Four gates were found one at a time (anatomy, guideline reachability,
// render invariants, the graph) and there was no reason to think the list ended.
// This is the general form: rather than teach gate N+1 about the ledger, assert
// the PRECONDITION that makes all of them pass, which is that nothing authored
// still names the retired slug.

var fs = require("node:fs");
var path = require("node:path");

// The authored surfaces keyed by slug. Each entry names the gate it fails, so a
// reader can tell whether a new surface belongs here. A `glob` entry is a
// directory whose files are all scanned.
//
// This list is authored and therefore rots, so a test asserts every path still
// exists: a surface that moved would make this scan nothing and wave every
// rename through, which is the false all-clear it exists to prevent.
var AUTHORED_SURFACES = [
  {
    path: "components/render/renderer/html-renderers/ds-html-map.js",
    why: "case labels feed RENDER_SLUGS; fragment-invariants invariant 5 fails when a slug is missing from every registry",
  },
  {
    path: "components/render/renderer/html-renderers/fm-html-map.js",
    why: "same switch shape for the FM tier",
  },
  {
    path: "app-context/src/patterns",
    glob: true,
    why: "components[] entries; derive-graph THROWS on a reference matching no registry key",
  },
  {
    path: "components/src/categories",
    glob: true,
    why: "category defaults name component slugs",
  },
];

function filesFor(repoRoot, surface) {
  var full = path.join(repoRoot, surface.path);
  if (!fs.existsSync(full)) return [];
  if (!surface.glob) return [full];
  return fs
    .readdirSync(full)
    .filter(function (f) {
      return /\.(md|ya?ml|json|js)$/.test(f);
    })
    .sort()
    .map(function (f) {
      return path.join(full, f);
    });
}

// Whole-token match. A substring match would let `card-for-items` block `card`,
// making every short slug permanently unabsorbable. Slugs are kebab-case, so the
// boundary is any character that is not a slug character.
function mentions(text, slug) {
  var escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^A-Za-z0-9-])" + escaped + "([^A-Za-z0-9-]|$)").test(
    text,
  );
}

// Authored files that still name `slug`. Empty means the rename is absorbable.
function authoredReferences(repoRoot, slug) {
  var hits = [];
  AUTHORED_SURFACES.forEach(function (surface) {
    filesFor(repoRoot, surface).forEach(function (file) {
      var text;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch (e) {
        // Unreadable means unknown, and unknown must not read as absent: an
        // unreadable surface blocks absorption rather than clearing it.
        hits.push({ file: file, why: "unreadable: " + e.message });
        return;
      }
      if (mentions(text, slug)) hits.push({ file: file, why: surface.why });
    });
  });
  return hits;
}

// The renames a run may absorb, filtered down from every rename it detected.
// Returns { absorbable, blocked } so the caller can report WHY a rename it might
// have absorbed stayed breaking.
function absorbable(repoRoot, renameIndex) {
  var out = {};
  var blocked = {};
  Object.keys(renameIndex || {}).forEach(function (from) {
    var refs = authoredReferences(repoRoot, from);
    if (refs.length === 0) out[from] = renameIndex[from];
    else blocked[from] = refs;
  });
  return { absorbable: out, blocked: blocked };
}

module.exports = {
  AUTHORED_SURFACES: AUTHORED_SURFACES,
  authoredReferences: authoredReferences,
  absorbable: absorbable,
  mentions: mentions,
};
