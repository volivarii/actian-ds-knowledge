"use strict";

// Shared helper for dist-shape snapshot tests. Walks a dist directory,
// hashes every file with SHA-256, and emits a deterministic `{path: hash}`
// map. Used by the per-section-split safety nets (foundations + accessibility)
// to guarantee byte-identical dist before and after the split refactor.
//
// Update snapshots with:  UPDATE_DIST_SNAPSHOTS=1 node --test tests/<name>.test.js

var fs = require("node:fs");
var path = require("node:path");
var crypto = require("node:crypto");

function walk(absDir, baseDir, acc) {
  acc = acc || [];
  if (!fs.existsSync(absDir)) return acc;
  fs.readdirSync(absDir, { withFileTypes: true })
    .sort(function (a, b) {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    })
    .forEach(function (ent) {
      var full = path.join(absDir, ent.name);
      if (ent.isDirectory()) {
        walk(full, baseDir, acc);
      } else if (ent.isFile()) {
        var rel = path
          .relative(baseDir, full)
          .split(path.sep)
          .join("/");
        acc.push({ relPath: rel, absPath: full });
      }
    });
  return acc;
}

function hashFile(absPath) {
  var buf = fs.readFileSync(absPath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// Returns { "<relPath>": "<sha256>" } map. Keys are sorted alphabetically.
function snapshotDist(distAbsDir) {
  var files = walk(distAbsDir, distAbsDir);
  files.sort(function (a, b) {
    return a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0;
  });
  var out = {};
  files.forEach(function (f) {
    out[f.relPath] = hashFile(f.absPath);
  });
  return out;
}

// Read an existing snapshot or null.
function readSnapshot(snapshotAbsPath) {
  if (!fs.existsSync(snapshotAbsPath)) return null;
  return JSON.parse(fs.readFileSync(snapshotAbsPath, "utf8"));
}

function writeSnapshot(snapshotAbsPath, snapshot) {
  fs.mkdirSync(path.dirname(snapshotAbsPath), { recursive: true });
  fs.writeFileSync(snapshotAbsPath, JSON.stringify(snapshot, null, 2) + "\n");
}

function shouldUpdate() {
  return Boolean(process.env.UPDATE_DIST_SNAPSHOTS);
}

// Compare two snapshots, returning a structured diff:
//   { added: [...], removed: [...], changed: [...] }
function diffSnapshots(expected, actual) {
  var added = [];
  var removed = [];
  var changed = [];
  Object.keys(actual).forEach(function (k) {
    if (!(k in expected)) added.push(k);
    else if (expected[k] !== actual[k]) changed.push(k);
  });
  Object.keys(expected).forEach(function (k) {
    if (!(k in actual)) removed.push(k);
  });
  return { added: added, removed: removed, changed: changed };
}

module.exports = {
  snapshotDist: snapshotDist,
  readSnapshot: readSnapshot,
  writeSnapshot: writeSnapshot,
  shouldUpdate: shouldUpdate,
  diffSnapshots: diffSnapshots,
};
