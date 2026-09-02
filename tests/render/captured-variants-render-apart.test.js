"use strict";

// tests/render/captured-variants-render-apart.test.js
//
// Where Figma tells us two variant values look DIFFERENT, the renderer must draw
// them differently. That is the whole of #550 that is answerable today.
//
// The census (derive-contract.js variantsOf) hashes rendered markup, so each of
// its 54 unexplained collapses means the renderer emitted byte-identical HTML
// for two values. Whether that is a defect depends on evidence, and the evidence
// is `appearance.variants` in components/dist/anatomy/<slug>.json: per-variant
// facts naming a background, border, text style or icon slug. Joining the two
// (#641) splits the 54 three ways --
//
//   * a captured fact that DIFFERS from the twin's -> a real defect, fixable
//   * a captured fact IDENTICAL to the twin's       -> Figma says they match
//   * no fact at all                                -> no target; fixing = guessing
//
// This gate owns the first group only, and it derives that group by reading the
// capture rather than listing slugs. A new nightly capture that distinguishes
// two more values enrols them automatically; one that stops distinguishing them
// drops them. Nothing here needs editing when Figma changes.
//
// Deliberately NOT asserting a count. A count would have to be updated on every
// sync and would pass while covering the wrong members -- the failure shape
// #516's hand-listed captures already cost this repo once.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var C = require("../../scripts/render/lib/variant-collapse.js");
var dsMap = require("../../components/render/renderer/html-renderers/ds-html-map.js");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var CONTRACT = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, "components/render/dist/render-contract.json"),
    "utf8",
  ),
);

function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

var factCache = {};
function variantFacts(slug) {
  if (factCache[slug]) return factCache[slug];
  var file = path.join(REPO_ROOT, "components/dist/anatomy", slug + ".json");
  if (!fs.existsSync(file)) return (factCache[slug] = []);
  var out = [];
  (function walk(node) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (node.appearance && Array.isArray(node.appearance.variants)) {
      node.appearance.variants.forEach(function (v) {
        out.push({ node: node.name, fact: v });
      });
    }
    (node.children || []).forEach(walk);
  })(JSON.parse(fs.readFileSync(file, "utf8")).root || {});
  return (factCache[slug] = out);
}

/** node name -> the captured appearance of this one value, as a stable string. */
function signature(slug, axis, value) {
  var out = {};
  variantFacts(slug).forEach(function (h) {
    if (norm(h.fact.prop) !== norm(axis)) return;
    if (!(h.fact.values || []).some(function (x) { return norm(x) === norm(value); })) return;
    var copy = Object.assign({}, h.fact);
    delete copy.values;
    delete copy.prop;
    out[h.node] = JSON.stringify(copy);
  });
  return out;
}

/**
 * Every {slug, axis, a, b} the capture says should look different.
 *
 * 🪤 This used to enumerate from the CURRENT collapse set, and that gate could
 * only ever pass while the defect existed: fixing the pairs emptied
 * collapseKeys, which emptied the subject, which reddened the
 * subject-presence check below. A gate whose subject is the defect it guards
 * disappears the moment it succeeds.
 *
 * So the subject comes from the capture instead, which is stable: for every
 * axis, every pair of values that BOTH carry captured facts and whose facts
 * differ. That set does not shrink when the renderer improves -- it only
 * changes when Figma changes -- and it keeps covering the pairs already fixed,
 * which is what stops a later edit quietly re-merging them.
 */
function provenDifferentPairs() {
  var pairs = [];
  var slugs = (CONTRACT && CONTRACT.slugs) || {};
  Object.keys(slugs).forEach(function (slug) {
    var variants = (slugs[slug] || {}).variants || {};
    Object.keys(variants).forEach(function (axis) {
      if (C.isStateAxis(axis)) return;
      var values = (variants[axis] || {}).values || [];
      var sigs = {};
      values.forEach(function (v) {
        var sig = signature(slug, axis, v);
        if (Object.keys(sig).length) sigs[v] = sig;
      });
      var named = Object.keys(sigs);
      for (var i = 0; i < named.length; i++) {
        for (var j = i + 1; j < named.length; j++) {
          var a = sigs[named[i]];
          var b = sigs[named[j]];
          var differs = Object.keys(a).some(function (node) {
            return b[node] !== undefined && b[node] !== a[node];
          });
          if (differs) {
            pairs.push({ slug: slug, axis: axis, a: named[i], b: named[j] });
          }
        }
      }
    });
  });
  return pairs;
}

function renderValue(slug, axis, value) {
  return dsMap.renderDSComponent({
    dsSlug: slug,
    variant: axis + "=" + value,
    props: { Label: "Contract probe" },
  });
}

var PAIRS = provenDifferentPairs();

test("the capture proves at least one pair apart, so this gate has a subject", function () {
  // Subject presence. If the join silently found nothing -- a renamed axis, a
  // capture that stopped carrying appearance.variants -- every assertion below
  // would vacuously pass and this file would report success over an empty set.
  assert.ok(
    PAIRS.length > 0,
    "no variant pair is proven different by the anatomy capture; either the " +
      "capture shape changed or the join in this file is stale",
  );
});

test("every pair Figma draws differently, the renderer draws differently too", function () {
  dsMap.setIcons(
    require(path.join(REPO_ROOT, "components/dist/icons/icons.json")).icons || {},
  );
  try {
    var same = [];
    PAIRS.forEach(function (p) {
      if (renderValue(p.slug, p.axis, p.a) === renderValue(p.slug, p.axis, p.b)) {
        same.push(p.slug + " " + p.axis + ": " + p.a + " renders identically to " + p.b);
      }
    });
    assert.deepEqual(
      same,
      [],
      same.length +
        " of " +
        PAIRS.length +
        " pairs the Figma capture distinguishes are byte-identical in the render:\n" +
        same.join("\n"),
    );
  } finally {
    dsMap.setIcons(null);
  }
});
