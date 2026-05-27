"use strict";

// Safety net for the upcoming per-section split of accessibility.md.
//
// accessibility.md carries explicit `{#slug}` markers on every H2/H3 heading
// (D1 contract). Today's derive script silently dedupes by first-occurrence
// (`derive-a11y-index.js:59`), masking two *intentional* intra-file slug
// re-uses: the §12 Designer Handoff Checklist sub-items re-use `color-contrast`
// and `motion` to deep-link back to their topic sections (§2 and §4).
//
// Post-split, each H2 becomes its own file. The re-uses become cross-file
// duplicates that current tooling would silently swallow. This test makes the
// allowlist explicit: any new duplicate triggers a fail-fast.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

// Anchors that are knowingly re-used elsewhere in the substrate (intentional
// cross-references). Each entry is the SLUG; if a duplicate slug appears in
// source that is NOT in this set, the test fails.
var ALLOWED_DUPLICATE_ANCHORS = new Set([
  "color-contrast", // §12 handoff sub-item references §2
  "motion", // §12 handoff sub-item references §4
]);

// Anchor markers only on H2/H3 heading lines (not body prose). The accessibility
// substrate constrains explicit anchors to heading lines per AUTHORING.md.
var HEADING_ANCHOR_RE = /^#{2,3}\s.*?\{#([a-z0-9-]+)\}\s*$/;

function collectHeadingAnchorsInFile(absPath) {
  var lines = fs.readFileSync(absPath, "utf8").split("\n");
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(HEADING_ANCHOR_RE);
    if (m) out.push({ slug: m[1], file: path.basename(absPath), line: i + 1 });
  }
  return out;
}

function listAccessibilitySources() {
  // Pre-split: single file. Post-split: walks `accessibility/src/**/*.md`.
  // Written as a list so the post-split refactor adds entries; pre-split test
  // already locks the contract.
  var legacy = path.resolve(
    __dirname,
    "..",
    "accessibility",
    "accessibility.md",
  );
  var splitRoot = path.resolve(__dirname, "..", "accessibility", "src");
  var files = [];
  if (fs.existsSync(legacy)) files.push(legacy);
  if (fs.existsSync(splitRoot)) {
    fs.readdirSync(splitRoot).forEach(function (name) {
      if (name.endsWith(".md") && name !== "AUTHORING.md") {
        files.push(path.join(splitRoot, name));
      }
    });
  }
  return files;
}

test("explicit heading anchors in accessibility sources match the documented allowlist", function () {
  var files = listAccessibilitySources();
  assert.ok(files.length > 0, "no accessibility source files found");

  var byGroup = Object.create(null);
  files.forEach(function (f) {
    collectHeadingAnchorsInFile(f).forEach(function (entry) {
      if (!byGroup[entry.slug]) byGroup[entry.slug] = [];
      byGroup[entry.slug].push(entry);
    });
  });

  var unexpectedDuplicates = [];
  Object.keys(byGroup).forEach(function (slug) {
    var occurrences = byGroup[slug];
    if (occurrences.length > 1 && !ALLOWED_DUPLICATE_ANCHORS.has(slug)) {
      unexpectedDuplicates.push(
        slug +
          " (" +
          occurrences.length +
          "x: " +
          occurrences
            .map(function (o) {
              return o.file + ":" + o.line;
            })
            .join(", ") +
          ")",
      );
    }
  });

  assert.deepEqual(
    unexpectedDuplicates,
    [],
    "Unexpected duplicate heading anchors (extend ALLOWED_DUPLICATE_ANCHORS only when intentional):\n  " +
      unexpectedDuplicates.join("\n  "),
  );
});

test("every allowlisted duplicate anchor still appears at least twice (otherwise drop from allowlist)", function () {
  // Self-policing: if a slug is on the allowlist but isn't actually duplicated
  // anymore, the allowlist has gone stale. Fail so the allowlist tracks
  // reality.
  var files = listAccessibilitySources();
  var counts = Object.create(null);
  files.forEach(function (f) {
    collectHeadingAnchorsInFile(f).forEach(function (entry) {
      counts[entry.slug] = (counts[entry.slug] || 0) + 1;
    });
  });

  var stale = [];
  ALLOWED_DUPLICATE_ANCHORS.forEach(function (slug) {
    if ((counts[slug] || 0) < 2) stale.push(slug);
  });

  assert.deepEqual(
    stale,
    [],
    "Allowlist entries no longer duplicated (remove them):\n  " +
      stale.join("\n  "),
  );
});
