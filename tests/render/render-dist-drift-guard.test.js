"use strict";

// The render dist's freshness is a MERGE-BLOCKING check, and it can only be
// deleted by editing a workflow file. This asserts it is still there.
//
// #571. `render-derive.yml` regenerates components/render/dist and auto-commits
// it, but it is not a required check, and none of its steps after the derive
// carries `if: always()`. A producer that throws therefore skips detect-changes,
// auto-bump and commit alike: the job goes red and the PR stays mergeable, so a
// stale render dist merges with no version bump, no tag, and no consumer ever
// seeing the change.
//
// `npm test` covers two of the eleven artifacts. Probed by mutating each
// committed file and running the render suite: render-contract.json and
// sparse-render.json go red; usage-notes/*.md, fidelity-report.json,
// quality-trend.json, quality-trend.md, render-manifest.json,
// custom-elements.json, render.css, render-fonts.css and fragments/*.html all
// stay green. The workflow guard takes its subject from the DIRECTORY, so it
// covers a new artifact on the day it is written.
//
// Cascade-safe: this reads a workflow file, never the dist, so it cannot fail
// mid-derive and block the workflow that exists to repair the tree.
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var YAML = require("yaml");

var WF = path.join(
  __dirname,
  "..",
  "..",
  ".github",
  "workflows",
  "validate-manifest.yml",
);
var DIST = "components/render/dist";

function steps() {
  var doc = YAML.parse(fs.readFileSync(WF, "utf8"));
  return doc.jobs.validate.steps;
}

// Does the branch taken WHEN DRIFT IS FOUND exit non-zero?
//
// 🪤 Written first as `/exit 1/.test(run)`, anywhere in the step. That passed
// with the exit deleted from the drift branch, because these guards carry a
// SECOND `exit 1` in the `|| { ... }` that catches a git failure. The step then
// printed the drift, listed the files, and exited 0: a silent green on the
// required check, which is precisely the failure mode the comments around this
// guard exist to warn about. A guard matching the wrong occurrence of the right
// token cannot fail.
function driftBranchExits(run) {
  var lines = String(run).split("\n");
  var start = lines.findIndex(function (l) {
    return /if\s+\[\s+-n\s+"\$DRIFT"\s+\]/.test(l);
  });
  if (start === -1) return false;
  for (var i = start + 1; i < lines.length; i++) {
    if (/^\s*fi\s*$/.test(lines[i])) return false;
    if (/^\s*exit\s+[1-9]/.test(lines[i])) return true;
  }
  return false;
}

test("the required check regenerates the render dist and fails on drift", function () {
  var all = steps();
  var deriveAt = all.findIndex(function (st) {
    return /npm run derive:render/.test(st.run || "");
  });
  assert.notEqual(
    deriveAt,
    -1,
    "validate-manifest.yml no longer runs `npm run derive:render`. It is the " +
      "only merge-blocking check on the render dist: render-derive.yml is " +
      "advisory, so without this a failed producer ships the dist stale.",
  );

  var guardAt = all.findIndex(function (st) {
    return (
      new RegExp("git status[^\\n]*--untracked-files=all[^\\n]*" + DIST).test(
        st.run || "",
      ) && driftBranchExits(st.run || "")
    );
  });
  assert.notEqual(
    guardAt,
    -1,
    "no step compares " +
      DIST +
      " against the regeneration and exits non-zero from the DRIFT branch. " +
      "`npm run derive:render` on its own only rewrites the tree, and a guard " +
      "that reports the drift without exiting is a silent green on a required " +
      "check.",
  );
  assert.ok(
    guardAt > deriveAt,
    "the drift guard runs before the derive, so it can only ever compare the " +
      "tree with itself",
  );
});

test("the drift guard runs after the suite, so the suite still reads the COMMITTED dist", function () {
  // tests/render/derive-contract.test.js and
  // tests/render/sparse-render-ratchet.test.js each assert a committed artifact
  // matches a fresh derive, and both read the WORKING TREE. Deriving before
  // `npm test` would hand them a freshly written dist and turn both into
  // fresh-against-fresh, which passes on anything.
  var all = steps();
  var testAt = all.findIndex(function (st) {
    return /^npm test\s*$/m.test(st.run || "");
  });
  var deriveAt = all.findIndex(function (st) {
    return /npm run derive:render/.test(st.run || "");
  });
  assert.notEqual(testAt, -1, "validate-manifest.yml no longer runs `npm test`");
  assert.notEqual(deriveAt, -1, "validate-manifest.yml no longer derives render");
  assert.ok(
    deriveAt > testAt,
    "`npm run derive:render` moved ahead of `npm test`, which silently " +
      "converts every committed-vs-fresh assertion in the suite into a " +
      "comparison of the fresh tree with itself",
  );
});

test("the derive reads the identity ledger, so it runs after the ledger is settled", function () {
  // derive-retired-slugs.js is the first link in the derive:render chain and it
  // reads components/dist/identity.json, which an earlier step in this same job
  // regenerates. Deriving the render dist first would build the retired-slug map
  // from a ledger this job is about to change.
  var all = steps();
  var ledgerAt = all.findIndex(function (st) {
    return /npm run derive:identity/.test(st.run || "");
  });
  var deriveAt = all.findIndex(function (st) {
    return /npm run derive:render/.test(st.run || "");
  });
  assert.notEqual(ledgerAt, -1, "validate-manifest.yml no longer derives the ledger");
  assert.ok(
    deriveAt > ledgerAt,
    "the render derive runs before the identity ledger it reads",
  );
  var src = fs.readFileSync(
    path.join(__dirname, "..", "..", "scripts", "render", "derive-retired-slugs.js"),
    "utf8",
  );
  assert.match(
    src,
    /identity\.json/,
    "positive control: the first producer in the chain no longer reads the " +
      "ledger, so this ordering assertion is guarding nothing",
  );
});
