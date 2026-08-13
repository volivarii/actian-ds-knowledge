"use strict";

// #525 — the committed llms index must describe the content committed with it.
//
// llms.txt and llms-full.txt are both listed in vendor-include.json, so they
// ship to consumers, and consumers resolve by TAG. A tag whose index does not
// match its own content is a shipped defect: llms.txt is the first thing an AI
// consumer reads to find anything else, so a stale entry is the ghost-reference
// problem (#517) reintroduced by release mechanics.
//
// SCOPE NOTE — why only llms.txt is asserted here, and llms-full.txt is not:
//
//   generateLlmsTxt() is a closed function of the generator source alone (a
//   static index of logical locations), so regenerating it can never disagree
//   with the rest of the tree. Asserting it inside `npm test` is therefore
//   always actionable: it fails only when llms.txt was hand-edited or the
//   generator's index was changed without regenerating.
//
//   generateLlmsFullTxt() additionally reads content/dist/global.md, which is
//   DERIVED by content-derive.yml on the same PR. The sibling derive workflows
//   run `npm test` BEFORE their auto-commit step, so a full-dump freshness
//   assertion in this suite would fail mid-cascade (llms-full.txt is stale until
//   llms-txt.yml regenerates it) and block those workflows from committing the
//   dist they exist to produce, breaking the "authors need no local toolchain"
//   guarantee. llms-full.txt is guarded instead by the re-derive-and-git-diff
//   step in the required "Validate manifest schema + coverage" check
//   (.github/workflows/validate-manifest.yml), which runs on a settled tree.
//   Do not "promote" that guard into this file without re-reading the above.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var llms = require("../scripts/llms-txt-generate.js");

var ROOT = path.resolve(__dirname, "..");

// Report the FIRST divergence with its line number and both sides, rather than
// dumping a whole-file diff: the actionable fact is which line drifted and in
// which direction (feedback: a gate must report drift direction).
function firstDifference(committed, fresh) {
  var a = committed.split("\n");
  var b = fresh.split("\n");
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return {
        line: i + 1,
        committed: a[i] === undefined ? "<end of file>" : a[i],
        fresh: b[i] === undefined ? "<end of file>" : b[i],
      };
    }
  }
  return null;
}

test("committed llms.txt matches what the generator produces", function () {
  var fresh = llms.generateLlmsTxt();

  // Assert the SUBJECT was present: an empty or trivial generation would make
  // the comparison below pass vacuously against an empty file.
  assert.ok(
    fresh.length > 200 && fresh.indexOf("# Actian Design System") === 0,
    "generateLlmsTxt() produced no usable index (" +
      fresh.length +
      " bytes) — the comparison below would be vacuous",
  );

  var committedPath = path.join(ROOT, "llms.txt");
  assert.ok(
    fs.existsSync(committedPath),
    "llms.txt is missing from the repo root — it is a vendored consumer contract; run `npm run derive:llms`",
  );
  var committed = fs.readFileSync(committedPath, "utf8");

  var diff = firstDifference(committed, fresh);
  if (diff) {
    assert.fail(
      "llms.txt is STALE: it does not match what scripts/llms-txt-generate.js\n" +
        "produces. First difference at line " +
        diff.line +
        ":\n" +
        "  committed: " +
        JSON.stringify(diff.committed) +
        "\n" +
        "  expected:  " +
        JSON.stringify(diff.fresh) +
        "\n" +
        "Refresh it with `npm run derive:llms` and commit the result.\n" +
        "llms.txt is vendored to consumers (vendor-include.json) and consumers\n" +
        "resolve by tag, so a stale index ships inside the release tag (#525).",
    );
  }
});
