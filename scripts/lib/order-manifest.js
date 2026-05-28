"use strict";

// Shared order-manifest helpers for substrate domains that use a per-
// directory _order.json to declare section order. Used by both
// derive-foundations.js and derive-a11y-index.js. The editor's TypeScript
// orderManifest module (Part 2) mirrors this CLI contract but lives
// editor-side; do not import across the boundary.
//
// _order.json is the per-directory ordering manifest. It MUST list every
// non-meta `.md` file in the directory by its slug (filename without the
// .md extension), in canonical concatenation order. Slug identity is
// decoupled from filesystem ordering; the manifest is the single source
// of truth for section order. See <domain>/src/AUTHORING.md for the
// authoring story.

var fs = require("node:fs");
var path = require("node:path");

var ORDER_MANIFEST_NAME = "_order.json";
var META_FILES = new Set(["AUTHORING.md", "README.md", ORDER_MANIFEST_NAME]);

// Resolve a human-readable domain label from a substrate src/ path.
// "/repo/foundations/src" → "foundations"; falls back to the dir name.
// Used to keep error messages useful to authors after the helpers were
// extracted from the per-domain derive scripts.
function domainLabel(srcDir) {
  return path.basename(path.dirname(srcDir)) || path.basename(srcDir);
}

function readOrderManifest(srcDir) {
  var label = domainLabel(srcDir);
  var manifestPath = path.join(srcDir, ORDER_MANIFEST_NAME);
  var raw;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        label +
          "/src/_order.json is missing — every substrate directory must declare its section order via this manifest. See " +
          label +
          "/src/AUTHORING.md.",
      );
    }
    throw new Error(
      label + "/src/_order.json could not be read: " + err.message,
      { cause: err },
    );
  }
  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      label + "/src/_order.json is not valid JSON: " + err.message,
      { cause: err },
    );
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every(function (x) {
      return typeof x === "string";
    })
  ) {
    throw new Error(
      label + "/src/_order.json must be an array of slug strings",
    );
  }
  return parsed;
}

function readSlugFiles(srcDir) {
  return new Set(
    fs
      .readdirSync(srcDir)
      .filter(function (n) {
        return n.endsWith(".md") && !META_FILES.has(n);
      })
      .map(function (n) {
        return n.replace(/\.md$/, "");
      }),
  );
}

function assertOrderConsistency(srcDir, order, onDisk) {
  var errors = [];
  // Duplicate-slug check: an entry appearing twice would cause the same
  // file to be concatenated twice into the dist output.
  var seen = new Set();
  order.forEach(function (slug, idx) {
    if (seen.has(slug)) {
      errors.push(
        '  - _order.json contains duplicate slug "' +
          slug +
          '" at index ' +
          idx,
      );
    }
    seen.add(slug);
  });
  for (var i = 0; i < order.length; i++) {
    if (!onDisk.has(order[i])) {
      errors.push(
        '  - _order.json references "' +
          order[i] +
          '" but ' +
          path.join(srcDir, order[i] + ".md") +
          " does not exist",
      );
    }
  }
  var orderSet = new Set(order);
  Array.from(onDisk).forEach(function (slug) {
    if (!orderSet.has(slug)) {
      errors.push(
        "  - " +
          path.join(srcDir, slug + ".md") +
          " exists but is not listed in _order.json",
      );
    }
  });
  if (errors.length > 0) {
    throw new Error(
      "_order.json drift in " + srcDir + ":\n" + errors.join("\n"),
    );
  }
}

module.exports = {
  ORDER_MANIFEST_NAME: ORDER_MANIFEST_NAME,
  META_FILES: META_FILES,
  readOrderManifest: readOrderManifest,
  readSlugFiles: readSlugFiles,
  assertOrderConsistency: assertOrderConsistency,
};
