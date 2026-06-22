"use strict";

// Accessibility per-section derive (ADDITIVE — does NOT touch a11y-index.json).
//
// Emits the hierarchical Pattern H per-section dist for accessibility ALONGSIDE
// the immovable flat `a11y-index.json`:
//
//   accessibility/dist/_index.json                 — root metadata + H2 child list
//   accessibility/dist/<slug>.json                 — leaf (single-H2) section
//   accessibility/dist/<branch>/_index.json        — branch (H2 with H3 children)
//   accessibility/dist/<branch>/<child>.json       — nested H3 leaf
//   accessibility/dist/accessibility.bundle.json   — full nested roll-up
//
// This uses the SAME agnostic emission engine as foundations
// (scripts/lib/section-dist) — NOT the foundations wrapper, so there are NO
// foundations-specific H2 skips. The accessibility-domain specifics live here:
//
//   - `rootAnchor: "accessibility"` so the root index anchors its H1 correctly
//     (the engine's default is the foundations "foundations" slug).
//   - `sourceRel: "accessibility/src/"` so the foundations `||` string default
//     never fires.
//   - WCAG harvest via `wcagBySlug` from derive-a11y-index.js — the SAME builder
//     the flat index uses, so the per-section `wcag` arrays cannot drift from
//     the index.
//
// The flat `a11y-index.json` and its derive (derive-a11y-index.js) are NOT
// touched by this script — they remain the byte-identical consumer-facing flat
// index. This adds the block-JSON tree beside it.

var fs = require("node:fs");
var path = require("node:path");
var { stableStringify, writeAtomic } = require("../lib/dist-io");

var a11yIndex = require("./derive-a11y-index.js");
var concatA11ySources = a11yIndex.concatA11ySources;
var wcagBySlug = a11yIndex.wcagBySlug;

var sectionDist = require("../lib/section-dist/index.js");
var deriveFromMarkdown = sectionDist.deriveFromMarkdown;

var SOURCE_REL = "accessibility/src/";
var ROOT_ANCHOR = "accessibility";

// Files the FLAT index derive owns — the per-section derive must never write
// over them. (a11y-index.json is the only one today; guarded defensively.)
var RESERVED_FILENAMES = { "a11y-index.json": true };

// Recursively walk a directory and return relative paths (forward-slashed) of
// all files matching `predicate(relPath)`. Mirrors derive-foundations.js so the
// prune below behaves identically; kept self-contained here (a shared-lib
// extraction of walkDir/deleteAndPruneEmpty is deferred) to keep this change
// scoped to the accessibility derive and avoid touching the foundations script.
function walkDir(dir, baseDir, predicate, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var ent = entries[i];
    var full = path.join(dir, ent.name);
    var rel = path.relative(baseDir, full).split(path.sep).join("/");
    if (ent.isDirectory()) {
      walkDir(full, baseDir, predicate, acc);
    } else if (ent.isFile()) {
      if (!predicate || predicate(rel)) acc.push(rel);
    }
  }
  return acc;
}

// Delete a file then recursively prune empty parent directories up to (but not
// including) `stopDir`. Same as derive-foundations.js.
function deleteAndPruneEmpty(absPath, stopDir) {
  fs.unlinkSync(absPath);
  var parent = path.dirname(absPath);
  while (
    parent &&
    parent !== stopDir &&
    parent.startsWith(stopDir + path.sep)
  ) {
    try {
      var entries = fs.readdirSync(parent);
      if (entries.length > 0) break;
      fs.rmdirSync(parent);
    } catch (_e) {
      break;
    }
    parent = path.dirname(parent);
  }
}

// The deepest heading anchor of a node (h2 < h3 < h4 by sorted key), falling
// back to the node id. Mirrors the consumer-side `deepestAnchor` used by the
// T5 slug-parity test: the index's flat single-segment slug equals a node's
// deepest anchor (top-level H2 → its own slug; nested H3 → the child slug).
function deepestAnchor(node) {
  var a = node.anchors || {};
  var keys = Object.keys(a).sort();
  return keys.length ? a[keys[keys.length - 1]] : node.id;
}

// Attach a `wcag` array to a node when the WCAG harvest has a NON-EMPTY entry
// for the node's deepest-anchor slug. Empty arrays are omitted (a section with
// no WCAG criteria simply carries no `wcag` key — consumers treat absent as
// none, matching how the schema marks `wcag` optional).
//
// CAVEAT — wcag attachment is SLUG-KEYED (by the node's deepest anchor), NOT
// content-keyed. A nested subsection whose deepest-anchor slug collides with a
// top-level section's slug will inherit that top-level section's wcag array
// (the harvest is a flat slug→wcag map; both nodes resolve to the same key).
// This is benign for current data: the only two collisions are the
// designer-handoff-checklist's `color-contrast` and `motion` H3s, which are
// topically aligned with the top-level color-contrast / motion sections, so
// inheriting their wcag is correct. Reviewers of FUTURE src edits should watch
// for unintended collisions (a new H3 slug that accidentally matches an
// unrelated top-level slug would silently pick up the wrong wcag).
function attachWcag(node, wmap) {
  var slug = deepestAnchor(node);
  var wcag = wmap[slug];
  if (Array.isArray(wcag) && wcag.length > 0) {
    node.wcag = wcag.slice();
  }
}

function deriveA11ySections(srcDir, logger) {
  logger = logger || { warn: function () {} };
  var md = concatA11ySources(srcDir);
  var out = deriveFromMarkdown(md, {
    sourceRel: SOURCE_REL,
    rootAnchor: ROOT_ANCHOR,
    logger: logger,
  });
  var wmap = wcagBySlug(md);

  // Attach wcag to every emitted per-section file (leaves + branch _index)
  // and to the root index. `files` + `bundle` share object references with the
  // emission plan, so mutating a `files[...]` entry is reflected in the bundle.
  Object.keys(out.files).forEach(function (rel) {
    attachWcag(out.files[rel], wmap);
  });
  attachWcag(out.rootIndex, wmap);

  return { files: out.files, rootIndex: out.rootIndex, bundle: out.bundle };
}

function writeOutputs(distDir, derived) {
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  var written = [];

  Object.keys(derived.files).forEach(function (rel) {
    var base = rel.split("/").pop();
    if (RESERVED_FILENAMES[base]) {
      throw new Error(
        "refusing to write '" +
          rel +
          "' — collides with the flat-index file '" +
          base +
          "' owned by derive-a11y-index.js",
      );
    }
    writeAtomic(path.join(distDir, rel), stableStringify(derived.files[rel]));
    written.push(rel);
  });

  writeAtomic(
    path.join(distDir, "_index.json"),
    stableStringify(derived.rootIndex),
  );
  written.push("_index.json");

  writeAtomic(
    path.join(distDir, "accessibility.bundle.json"),
    stableStringify(derived.bundle),
  );
  written.push("accessibility.bundle.json");

  // Prune stale auto-generated JSON so a renamed/deleted src section self-heals
  // (mirrors derive-foundations.js writeOutputs). A file is deleted ONLY when
  // it is: (a) a `.json`, (b) NOT one this run just wrote, (c) NOT a reserved
  // filename, AND (d) carries our own `_meta.auto_generated === true` marker.
  //
  // The reserved-filename exclusion is the immovable contract: a11y-index.json
  // is produced by derive-a11y-index.js and ALSO carries
  // `_meta.auto_generated === true`, so the marker check alone would NOT
  // protect it — RESERVED_FILENAMES is the explicit guard that does. Any other
  // hand-maintained / non-auto_generated file is skipped by check (d).
  //
  // Because every file this run writes is in `owned`, a clean derive (no
  // orphans) deletes ZERO files → byte-identical, idempotent output.
  var owned = {};
  written.forEach(function (rel) {
    owned[rel] = true;
  });
  var removed = [];
  var existing = walkDir(distDir, distDir, function (rel) {
    return /\.json$/.test(rel);
  });
  for (var i = 0; i < existing.length; i++) {
    var rel = existing[i];
    if (owned[rel]) continue;
    var base = rel.split("/").pop();
    if (RESERVED_FILENAMES[base]) continue; // never delete a11y-index.json
    var full = path.join(distDir, rel);
    try {
      var contents = JSON.parse(fs.readFileSync(full, "utf-8"));
      if (
        contents &&
        contents._meta &&
        contents._meta.auto_generated === true
      ) {
        deleteAndPruneEmpty(full, distDir);
        removed.push(rel);
      }
    } catch (_e) {
      // Malformed — leave for a human.
    }
  }

  return { written: written, removed: removed };
}

if (require.main === module) {
  var srcDir = path.resolve(__dirname, "..", "..", "accessibility", "src");
  var distDir = path.resolve(__dirname, "..", "..", "accessibility", "dist");
  var logger = {
    warn: function (m) {
      console.warn("[derive-a11y-sections] " + m);
    },
  };
  var derived = deriveA11ySections(srcDir, logger);
  var wr = writeOutputs(distDir, derived);
  console.log(
    "[derive-a11y-sections] wrote " +
      wr.written.length +
      " files to " +
      distDir +
      (wr.removed.length ? " (pruned " + wr.removed.length + " stale)" : "") +
      " (a11y-index.json untouched)",
  );
  if (wr.removed.length) {
    console.log("[derive-a11y-sections] pruned: " + wr.removed.join(", "));
  }
}

module.exports = {
  deriveA11ySections: deriveA11ySections,
  writeOutputs: writeOutputs,
  stableStringify: stableStringify,
  deepestAnchor: deepestAnchor,
  SOURCE_REL: SOURCE_REL,
  ROOT_ANCHOR: ROOT_ANCHOR,
};
