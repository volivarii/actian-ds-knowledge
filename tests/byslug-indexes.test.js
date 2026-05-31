"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var REPO_ROOT = path.resolve(__dirname, "..");
var motion = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, "foundations/dist/tokens/motion.json"),
    "utf8",
  ),
);
var a11y = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, "accessibility/dist/a11y-index.json"),
    "utf8",
  ),
);

test("motion.json bySlug indexes every pattern by its .slug", function () {
  assert.ok(
    motion.bySlug && typeof motion.bySlug === "object",
    "motion.bySlug present",
  );
  var patterns = Object.values(motion.patterns);
  assert.equal(
    Object.keys(motion.bySlug).length,
    patterns.length,
    "bySlug count === patterns count",
  );
  patterns.forEach(function (p) {
    assert.ok(motion.bySlug[p.slug], "bySlug has slug " + p.slug);
    assert.equal(
      motion.bySlug[p.slug].slug,
      p.slug,
      "bySlug[" + p.slug + "] resolves to the right entry",
    );
  });
  assert.equal(motion.bySlug["drawer-open-close"].name, "Drawer (open/close)");
});

test("a11y-index.json bySlug indexes every section by its .slug", function () {
  assert.ok(
    a11y.bySlug && typeof a11y.bySlug === "object",
    "a11y.bySlug present",
  );
  assert.equal(
    Object.keys(a11y.bySlug).length,
    a11y.sections.length,
    "bySlug count === sections count",
  );
  a11y.sections.forEach(function (s) {
    assert.ok(a11y.bySlug[s.slug], "bySlug has slug " + s.slug);
    assert.equal(
      a11y.bySlug[s.slug].slug,
      s.slug,
      "bySlug[" + s.slug + "] resolves to the right entry",
    );
  });
  assert.equal(a11y.bySlug["color-contrast"].title, "2. Color & Contrast");
});
