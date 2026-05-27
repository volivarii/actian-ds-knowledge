"use strict";

// Safety net for the upcoming per-section split of foundations.md.
//
// Today, `foundations/src/foundations.md` carries explicit `{#slug}` anchors
// only on motion-pattern bold paragraphs (8 anchors). Heading-level slugs are
// AST-derived through per-scope sluggers and so are structurally unique by
// construction.
//
// Post-split, each per-section file may declare additional explicit anchors;
// without a global uniqueness invariant, two files could accidentally claim
// the same slug, breaking deep-links + plugin lookups. This test enumerates
// every `{#slug}` occurrence in the source and asserts global uniqueness.
//
// Pre-split: passes vacuously (8 motion-pattern anchors, all distinct).
// Post-split: enforces the contract on the multi-file substrate.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var ANCHOR_RE = /\{#([a-z0-9-]+)\}/g;

function collectAnchorsInFile(absPath) {
  var src = fs.readFileSync(absPath, "utf8");
  var out = [];
  var m;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(src)) !== null) {
    out.push({ slug: m[1], file: path.basename(absPath) });
  }
  return out;
}

function listFoundationsSources() {
  // Pre-split: single file. Post-split: this should walk
  // `foundations/src/**/*.md` (excluding AUTHORING.md). Written as a list so
  // the post-split refactor only adds entries; pre-split test still locks the
  // contract.
  var root = path.resolve(__dirname, "..", "foundations", "src");
  return [path.join(root, "foundations.md")];
}

test("every explicit {#slug} anchor in foundations sources is globally unique", function () {
  var files = listFoundationsSources();
  var all = [];
  files.forEach(function (f) {
    if (fs.existsSync(f)) {
      all = all.concat(collectAnchorsInFile(f));
    }
  });

  var seen = Object.create(null);
  var dups = [];
  all.forEach(function (entry) {
    if (seen[entry.slug]) {
      dups.push(entry.slug + " (in " + seen[entry.slug] + " and " + entry.file + ")");
    } else {
      seen[entry.slug] = entry.file;
    }
  });

  assert.deepEqual(
    dups,
    [],
    "Duplicate explicit anchors detected in foundations sources:\n  " +
      dups.join("\n  "),
  );
});

test("the 8 motion pattern anchors are present (regression guard for D2 contract)", function () {
  // Cross-references project_foundations_per_h3_split_next.md risk-gate #2:
  // the motion-section anchors are load-bearing for plugin consumers
  // (foundations/dist/tokens/motion.json#patterns[*].slug). Any split
  // refactor MUST preserve these 8 anchors verbatim.
  var expected = [
    "drawer-open-close",
    "accordion-expand-collapse",
    "success-toast",
    "anchor-motion",
    "layered-overlays-modals",
    "skeleton-loading",
    "staggered-entrance",
    "state-transitions",
  ];
  var files = listFoundationsSources();
  var anchors = new Set();
  files.forEach(function (f) {
    if (!fs.existsSync(f)) return;
    collectAnchorsInFile(f).forEach(function (e) {
      anchors.add(e.slug);
    });
  });

  expected.forEach(function (slug) {
    assert.ok(
      anchors.has(slug),
      "Motion pattern anchor '{#" + slug + "}' missing from foundations sources",
    );
  });
});
