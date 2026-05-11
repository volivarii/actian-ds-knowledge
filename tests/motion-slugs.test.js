"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var motion = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "..", "foundations", "dist", "interaction-motion.json"),
  "utf8"
));

// patterns is an object keyed by short-slug (legacy); each value contains
// a canonical `slug` field per PR α (Q1 2026 ecosystem plan).
function patternsList(m) {
  if (Array.isArray(m.patterns)) return m.patterns;
  return Object.keys(m.patterns).map(function (k) {
    return Object.assign({ _key: k }, m.patterns[k]);
  });
}

test("every motion pattern has a slug field", function () {
  var list = patternsList(motion);
  assert.ok(list.length > 0, "patterns non-empty");
  list.forEach(function (p, i) {
    assert.ok(p.slug, "pattern[" + i + "] (" + p.name + ") missing slug");
    assert.ok(/^[a-z][a-z0-9-]*$/.test(p.slug), "slug invalid format: " + p.slug);
  });
});

test("motion slugs are unique", function () {
  var list = patternsList(motion);
  var slugs = list.map(function (p) { return p.slug; });
  var unique = Array.from(new Set(slugs));
  assert.equal(slugs.length, unique.length, "duplicate slugs detected");
});

test("known canonical slug mapping is correct", function () {
  var list = patternsList(motion);
  var byName = {};
  list.forEach(function (p) { byName[p.name] = p.slug; });
  assert.equal(byName["State Transitions"], "state-transitions");
  assert.equal(byName["Drawer (open/close)"], "drawer-open-close");
  assert.equal(byName["Skeleton Loading"], "skeleton-loading");
  assert.equal(byName["Accordion (expand/collapse)"], "accordion-expand-collapse");
  assert.equal(byName["Success Toast"], "success-toast");
  assert.equal(byName["Layered Overlays — Modals"], "layered-overlays-modals");
  assert.equal(byName["Staggered Entrance — Lists, Table Rows, Search Cards"], "staggered-entrance");
  assert.equal(byName["The \"Anchor\" Motion — Dropdowns, Popovers, and Tooltips"], "anchor-motion");
});
