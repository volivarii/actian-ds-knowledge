"use strict";

// #519: the tracker this workflow emits tells a human to carry a breaking sync
// by dispatching this workflow against their branch. That instruction was false.
// The only step that committed anything was gated on an ADDITIVE verdict, so a
// dispatched breaking run regenerated every dist file into the runner, went
// green, and died with the runner. This repo's own false-all-clear shape: the
// run passed, the instructions were followed, and nothing was produced.
//
// These tests assert the JOIN between the printed instruction and the mechanism,
// not the presence of either alone.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var YAML = require("yaml");

var WORKFLOW = path.join(__dirname, "..", ".github", "workflows", "sync-from-figma.yml");
var raw = fs.readFileSync(WORKFLOW, "utf8");
var doc = YAML.parse(raw);
var steps = doc.jobs.sync.steps;

function stepsThatPushToTheDispatchedRef() {
  return steps.filter(function (s) {
    var run = String((s && s.run) || "");
    // Either the expression or the env var GitHub provides for it; the env var
    // is preferred in a run block, so accept both rather than pinning a style.
    return /git push\b/.test(run) && /GITHUB_REF_NAME|github\.ref_name/.test(run);
  });
}

test("the tracker tells a human to dispatch this workflow, so a dispatch must produce something", function () {
  var trackerPrintsDispatch = steps.some(function (s) {
    return /workflow_dispatch/.test(String((s && s.run) || "")) &&
      /To handle it/.test(String((s && s.run) || ""));
  });
  assert.ok(
    trackerPrintsDispatch,
    "fixture drift: no step prints the tracker's `To handle it` dispatch instruction",
  );

  assert.equal(
    stepsThatPushToTheDispatchedRef().length,
    1,
    "the tracker instructs a dispatch, so exactly one step must push what that run generated " +
      "onto the dispatched ref; without it the instruction is false and the run is a silent no-op",
  );
});

test("the dispatch push cannot fire on the nightly or against the default branch", function () {
  var push = stepsThatPushToTheDispatchedRef()[0];
  assert.ok(push, "no dispatch-push step to check");
  var cond = String(push["if"] || "");

  assert.match(
    cond,
    /github\.event_name\s*==\s*'workflow_dispatch'/,
    "must be gated on workflow_dispatch, or the 07:00 nightly would push dist to whatever it ran on",
  );
  assert.match(
    cond,
    /github\.ref_name\s*!=\s*github\.event\.repository\.default_branch/,
    "must refuse the default branch: a breaking sync is never mergeable as-is, so pushing it " +
      "straight onto main is the outcome the rolling tracker exists to prevent",
  );
});
