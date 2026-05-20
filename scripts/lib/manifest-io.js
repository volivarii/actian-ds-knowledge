"use strict";

// Canonical writer for paths-manifest.json.
//
// Five scripts rewrite paths-manifest.json (derive-categories, derive-
// guidelines, derive-foundations, sync-from-figma, bump-version). The derive
// scripts regenerate their own key block by deleting the old keys and
// re-adding them — and JavaScript appends re-added keys to the END of the
// object. So each derive shoved its block past the others'. With the App
// token making auto-commits re-trigger CI, two derives on the same PR
// ping-ponged each other's blocks forever.
//
// Fix: every writer emits `paths` and `collections` with keys in canonical
// (alphabetical) order. The output is then byte-identical regardless of which
// script wrote last — no diff, no re-trigger, no loop. Alphabetical order on
// the dotted keys also keeps each namespace (`components.*`, `foundations.*`,
// …) grouped.

var fs = require("node:fs");

function sortKeys(obj) {
  var out = {};
  Object.keys(obj)
    .sort()
    .forEach(function (k) {
      out[k] = obj[k];
    });
  return out;
}

// Reorder a manifest's `paths` and `collections` maps into canonical key
// order, in place. Returns the same object for convenience.
function canonicalizeManifest(manifest) {
  if (manifest && manifest.paths) manifest.paths = sortKeys(manifest.paths);
  if (manifest && manifest.collections) {
    manifest.collections = sortKeys(manifest.collections);
  }
  return manifest;
}

// Write paths-manifest.json with canonical key order + trailing newline.
function writeManifest(manifestPath, manifest) {
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(canonicalizeManifest(manifest), null, 2) + "\n",
  );
}

module.exports = {
  canonicalizeManifest: canonicalizeManifest,
  writeManifest: writeManifest,
};
