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
var D = require("../scripts/graph/derive-graph.js");

var WORKFLOW = path.join(
  __dirname,
  "..",
  ".github",
  "workflows",
  "graph-derive.yml",
);

// Every data input glob derive-graph.js consumes: the registries, read from the
// deriver rather than restated (a fourth kit added to REGISTRY_FILES must reach
// this trigger set, or a PR touching only that kit never re-triggers the derive
// and the committed graph goes stale with no self-healing path -- the same shape
// as the 2026-06-30 incident above); the category-overrides stopgap
// (readCategoryOverrides); categories + guidelines + a11y-index; foundations
// bundle + motion tokens via collectMotionPatterns; content/src UX-pattern
// topics. Keep in sync with the "Graph inputs" comment block in graph-derive.yml.
// Code inputs, as opposed to data inputs. The kit list is the one that bites:
// it deliberately sits outside scripts/graph/** (so gates can read it without
// loading the deriver), which also means no other glob covers it.
var REQUIRED_CODE_TRIGGER_PATHS = ["scripts/lib/registry-files.js"];

var REQUIRED_TRIGGER_PATHS = D.REGISTRY_FILES.concat([
  "components/src/category-overrides.json",
  "components/dist/categories/**",
  "components/dist/guidelines/**",
  "accessibility/dist/a11y-index.json",
  "foundations/dist/foundations.bundle.json",
  "foundations/dist/tokens/motion.json",
  "content/src/**/*.md",
  "app-context/dist/app-context.json",
]);

// The registry<->graph checks live in a validate-manifest STEP, not in this suite
// (a sync commits registries before the graph, so the pair is transiently unequal
// on every registry-changing PR, and the sibling derive workflows run `npm test`
// before their auto-commit). That placement is correct, but it leaves the step
// reachable from exactly one `run:` line.
//
// Be accurate about what its removal would cost, because a maintainer reading an
// overclaim here might relax the drift guard instead. A registry/graph divergence
// does NOT go unnoticed without it: the drift guard re-derives and diffs, and no
// step between them touches the registries, so it fails there too. What is lost is
// (a) the diagnostic -- which slug moved, versus "the artifact is stale" -- and
// (b) genuinely uncovered ground: a committed kit the deriver never reads, and a
// listed kit that vanished, both of which produce NO drift at all.
//
// Same reason this file asserts the derive triggers: a workflow edit must not be
// able to delete a gate silently. Cascade-safe here -- it reads a workflow file,
// not the registries.
test("validate-manifest runs the graph/registry union check", function () {
  var wf = path.join(
    __dirname,
    "..",
    ".github",
    "workflows",
    "validate-manifest.yml",
  );
  var src = fs.readFileSync(wf, "utf8");
  var script = "scripts/validate/validate-graph-registry-union.js";
  assert.ok(
    fs.existsSync(path.join(__dirname, "..", script)),
    script +
      " is missing; it carries the registry-list checks nothing else makes.",
  );
  assert.ok(
    src.includes(script),
    "validate-manifest.yml no longer runs " +
      script +
      "; it is the only check that a committed kit is one the deriver reads, and " +
      "the only place a registry/graph divergence is reported by slug rather " +
      "than as an undifferentiated stale-artifact diff.",
  );
  // Before the drift guard, or it never runs in the case it exists to explain:
  // that guard exits 1 on a stale graph and aborts the job.
  var doc = YAML.parse(src);
  var steps = doc.jobs.validate.steps.map(function (st) {
    return (st.run || "") + " " + (st.name || "");
  });
  var unionAt = steps.findIndex(function (st) {
    return st.includes(script);
  });
  var driftAt = steps.findIndex(function (st) {
    return st.indexOf("Graph drift guard") !== -1;
  });
  assert.ok(unionAt !== -1 && driftAt !== -1, "both steps present");
  assert.ok(
    unionAt < driftAt,
    "the union check must run BEFORE the graph drift guard, which aborts the " +
      "job on a stale graph and would prevent it running at all.",
  );
});

// validate-schemas decides WHICH registries it validates from the same kit list,
// so that list is one of its inputs too. Asserted here beside the graph-derive
// trigger because the failure is identical: an edit that changes the gate's
// subject without re-running the gate.
test("validate-schemas PR triggers cover the kit list it validates from", function () {
  var wf = path.join(
    __dirname,
    "..",
    ".github",
    "workflows",
    "validate-schemas.yml",
  );
  var doc = YAML.parse(fs.readFileSync(wf, "utf8"));
  var on = doc.on || doc[true];
  var triggerPaths = (on && on.pull_request && on.pull_request.paths) || [];
  assert.ok(
    triggerPaths.includes("scripts/lib/registry-files.js"),
    "validate-schemas.yml PR trigger is missing 'scripts/lib/registry-files.js'; " +
      "validate-registries derives its subject from that file, so editing it " +
      "would change what is validated without re-running the gate.",
  );
});

test("graph-derive PR triggers cover every graph data input", function () {
  var doc = YAML.parse(fs.readFileSync(WORKFLOW, "utf8"));
  // YAML 1.2 keeps `on` as a string key; fall back to the boolean-coerced key
  // in case a 1.1 parser ever turns "on:" into true.
  var on = doc.on || doc[true];
  var triggerPaths = (on && on.pull_request && on.pull_request.paths) || [];
  REQUIRED_CODE_TRIGGER_PATHS.forEach(function (p) {
    assert.ok(
      triggerPaths.includes(p),
      "graph-derive.yml PR trigger is missing code input '" +
        p +
        "'; editing it would not re-trigger the derive, leaving the committed " +
        "graph stale with no self-healing path.",
    );
  });
  REQUIRED_TRIGGER_PATHS.forEach(function (p) {
    assert.ok(
      triggerPaths.includes(p),
      "graph-derive.yml PR trigger is missing data input '" +
        p +
        "'; a graph input the deriver reads will not re-trigger the rebuild.",
    );
  });
});
