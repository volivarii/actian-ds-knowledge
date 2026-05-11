"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var md = fs.readFileSync(
  path.resolve(__dirname, "..", "accessibility", "accessibility.md"),
  "utf8",
);

var idx = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "..", "accessibility", "dist", "a11y-index.json"),
    "utf8",
  ),
);

test("every H2 in accessibility.md has a stable slug", function () {
  var lines = md.split("\n");
  var h2s = lines.filter(function (l) {
    return /^## /.test(l);
  });
  assert.ok(h2s.length > 0, "must have at least one H2 section");
  h2s.forEach(function (h) {
    assert.ok(
      /\{#[a-z][a-z0-9-]*\}\s*$/.test(h),
      "H2 missing slug anchor: " + h,
    );
  });
});

test("a11y-index.json is consistent with accessibility.md anchors", function () {
  var idx = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "..", "accessibility", "dist", "a11y-index.json"),
      "utf8",
    ),
  );
  assert.ok(idx.sections.length > 0);
  idx.sections.forEach(function (s) {
    assert.ok(s.slug, "section missing slug");
    assert.ok(s.title, "section missing title");
    assert.ok(Array.isArray(s.wcag), "section wcag must be array");
  });
});

test("a11y-index.json slugs match accessibility.md H2 anchors", function () {
  var idx = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "..", "accessibility", "dist", "a11y-index.json"),
      "utf8",
    ),
  );
  var lines = md.split("\n");
  var h2Slugs = [];
  lines.forEach(function (l) {
    var m = l.match(/^##\s+.+?\{#([a-z][a-z0-9-]*)\}\s*$/);
    if (m) h2Slugs.push(m[1]);
  });
  var idxSlugs = idx.sections.map(function (s) {
    return s.slug;
  });
  assert.deepEqual(idxSlugs, h2Slugs, "slug ordering must match");
});

test("layout-responsiveness includes inline WCAG ref 2.5.8", function () {
  var layoutSection = idx.sections.find(function (s) {
    return s.slug === "layout-responsiveness";
  });
  assert.ok(layoutSection, "layout-responsiveness section must exist");
  assert.ok(
    layoutSection.wcag.includes("2.5.8"),
    "layout-responsiveness must include 2.5.8",
  );
});

test("component-specific-checklists section populates WCAG refs from **WCAG criteria:** lines", function () {
  var sec = idx.sections.find(function (s) {
    return s.slug === "component-specific-checklists";
  });
  assert.ok(sec, "component-specific-checklists section must exist");
  assert.ok(
    sec.wcag.length > 0,
    "component-specific-checklists must have at least one WCAG ref",
  );
  // Buttons section has 2.1.1, 2.4.3, 2.4.7 per accessibility.md
  assert.ok(sec.wcag.includes("2.1.1"), "must include 2.1.1 (Keyboard)");
});
