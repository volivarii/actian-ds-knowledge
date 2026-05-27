"use strict";

// P8 transversal-ref resolution test.
//
// Foundations src files may attach `a11y_refs` + `motion_refs` arrays via
// optional YAML frontmatter (see derive-foundations.js — attachFrontmatterRefs).
// Every emitted ref MUST resolve to a real slug:
//   - a11y_refs[*].ref → accessibility/dist/a11y-index.json#sections[*].slug
//   - motion_refs[*].ref  → foundations/dist/tokens/motion.json#patterns[*].slug
// This mirrors the existing a11y-section-ids.test.js guard for the category-
// defaults consumer side. Both directions need a guard so a renamed slug fails
// loudly in CI rather than silently dropping the ref binding.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var REPO_ROOT = path.resolve(__dirname, "..");
var DIST = path.join(REPO_ROOT, "foundations", "dist");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function walkJsonFiles(dir, out) {
  out = out || [];
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var ent = entries[i];
    var full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsonFiles(full, out);
    else if (ent.isFile() && ent.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function collectRefs(distDir) {
  var refs = { a11y_refs: [], motion_refs: [] };
  var files = walkJsonFiles(distDir);
  for (var i = 0; i < files.length; i++) {
    var rel = path.relative(distDir, files[i]).split(path.sep).join("/");
    var json;
    try {
      json = readJson(files[i]);
    } catch (_) {
      continue;
    }
    if (Array.isArray(json.a11y_refs)) {
      json.a11y_refs.forEach(function (r) {
        refs.a11y_refs.push({ file: rel, ref: r.ref });
      });
    }
    if (Array.isArray(json.motion_refs)) {
      json.motion_refs.forEach(function (r) {
        refs.motion_refs.push({ file: rel, ref: r.ref });
      });
    }
  }
  return refs;
}

var a11ySlugs = new Set(
  readJson(
    path.join(REPO_ROOT, "accessibility", "dist", "a11y-index.json"),
  ).sections.map(function (s) {
    return s.slug;
  }),
);

var motionSlugs = new Set(
  Object.values(
    readJson(path.join(DIST, "tokens", "motion.json")).patterns || {},
  ).map(function (p) {
    return p.slug;
  }),
);

var refs = collectRefs(DIST);

test("foundations a11y_refs refs resolve to real a11y-index slugs", function () {
  var unresolved = refs.a11y_refs.filter(function (r) {
    return !a11ySlugs.has(r.ref);
  });
  assert.deepEqual(
    unresolved,
    [],
    "unresolved a11y_refs refs:\n" +
      unresolved
        .map(function (r) {
          return "  " + r.file + " → '" + r.ref + "'";
        })
        .join("\n") +
      "\n\nValid slugs live in accessibility/dist/a11y-index.json#sections[*].slug.",
  );
});

test("foundations motion_refs resolve to real motion.json#patterns slugs", function () {
  var unresolved = refs.motion_refs.filter(function (r) {
    return !motionSlugs.has(r.ref);
  });
  assert.deepEqual(
    unresolved,
    [],
    "unresolved motion_refs:\n" +
      unresolved
        .map(function (r) {
          return "  " + r.file + " → '" + r.ref + "'";
        })
        .join("\n") +
      "\n\nValid slugs live in foundations/dist/tokens/motion.json#patterns[*].slug.",
  );
});

test("at least one foundations section carries P8 transversal refs (smoke)", function () {
  // Once authored, prevent silent regression: if both ref arrays empty, the
  // attachment pipeline likely broke without anyone noticing.
  assert.ok(
    refs.a11y_refs.length > 0,
    "no a11y_refs refs found in foundations/dist — attachment likely broken",
  );
  assert.ok(
    refs.motion_refs.length > 0,
    "no motion_refs found in foundations/dist — attachment likely broken",
  );
});
