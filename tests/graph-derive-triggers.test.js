"use strict";

// Guard: graph-derive.yml must re-trigger on EVERY data input that
// scripts/graph/derive-graph.js reads. The graph is downstream of several
// per-domain derives; if a derive auto-commits a dist that the graph reads but
// that path is absent from graph-derive's PR trigger set, the graph never
// regenerates and graph-coverage (tests/graph-coverage.test.js) + the
// validate-manifest drift guard fail with no self-healing path.
//
// Real incident (2026-06-30): component-tier a11y_refs land in
// components/dist/guidelines/<slug>.json, but that glob was missing from the
// trigger set, so authored a11y_refs never emitted graph edges on PR.
//
// One-directional by design: this asserts every known input is wired as a
// trigger, not the reverse (that each trigger is still read by the deriver).
// Re-adding a dropped input is the failure this guards; pruning a genuinely
// unused trigger is a conscious edit that updates the list below.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var YAML = require("yaml");

var WORKFLOW = path.join(
  __dirname,
  "..",
  ".github",
  "workflows",
  "graph-derive.yml",
);

// Every data input glob derive-graph.js consumes (registries: lines 16-17;
// category-overrides stopgap (readCategoryOverrides); categories + guidelines
// + a11y-index; foundations bundle + motion tokens via
// collectMotionPatterns; content/src UX-pattern topics). Keep in sync with the
// "Graph inputs" comment block in graph-derive.yml.
var REQUIRED_TRIGGER_PATHS = [
  "components/dist/registries/dskit.json",
  "components/dist/registries/fmkit.json",
  "components/dist/registries/metakit.json",
  "components/src/category-overrides.json",
  "components/dist/categories/**",
  "components/dist/guidelines/**",
  "accessibility/dist/a11y-index.json",
  "foundations/dist/foundations.bundle.json",
  "foundations/dist/tokens/motion.json",
  "content/src/**/*.md",
  "app-context/dist/app-context.json",
];

test("graph-derive PR triggers cover every graph data input", function () {
  var doc = YAML.parse(fs.readFileSync(WORKFLOW, "utf8"));
  // YAML 1.2 keeps `on` as a string key; fall back to the boolean-coerced key
  // in case a 1.1 parser ever turns "on:" into true.
  var on = doc.on || doc[true];
  var triggerPaths = (on && on.pull_request && on.pull_request.paths) || [];
  REQUIRED_TRIGGER_PATHS.forEach(function (p) {
    assert.ok(
      triggerPaths.includes(p),
      "graph-derive.yml PR trigger is missing data input '" +
        p +
        "'; a graph input the deriver reads will not re-trigger the rebuild.",
    );
  });
});
