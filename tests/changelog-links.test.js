"use strict";
// #581: CHANGELOG.md's own header says "Each entry links its pull request."
// Six entries reached main linking nothing.
//
// The convention was to write `([#PR](_PR link added at open_))` and fill it
// when the PR opened. Six survived unfilled, from four different PRs across two
// months, each rendering as a broken link on the repository's front-page
// changelog. Six occurrences is the finding: "fill it at open" is a step that
// demonstrably does not happen, and it was not one author's lapse.
//
// So the placeholder is gone rather than policed. The rule is now positive and
// stateless: every link in this file points somewhere real. An entry written
// before its PR exists carries no link at all until the link is added, which is
// one commit on a branch that is already going to be pushed again. There is no
// half-written state left that can be forgotten, which is the only reason the
// six survived.
//
// The check runs over the WHOLE file rather than over a diff, because change
// detection built on `git diff` cannot see what it was not asked about, and an
// entry promoted from Unreleased to a version is not a diff to CHANGELOG.md's
// link at all.
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var FILE = path.join(__dirname, "..", "CHANGELOG.md");
var TEXT = fs.readFileSync(FILE, "utf8");

/** The prose, with code removed.
 *
 *  Necessary, not defensive: this changelog QUOTES link syntax as prose, in
 *  backticks, when it writes about broken cross-links. `[drawer](drawer-side-panel)`
 *  and `](slug)` are subjects under discussion, not links, and a scanner that
 *  cannot tell them apart reports seven failures that are all correct text. */
function prose(md) {
  return md
    .replace(/^```[\s\S]*?^```/gm, "") // fenced blocks
    .replace(/`[^`\n]*`/g, ""); // inline code spans
}

/** Every markdown link target in the prose, with the line it sits on. */
function linkTargets(md) {
  var lines = prose(md).split("\n");
  var found = [];
  lines.forEach(function (line, i) {
    var re = /\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
    var m;
    while ((m = re.exec(line)) !== null) {
      found.push({ line: i + 1, target: m[1] });
    }
  });
  return found;
}

test("CHANGELOG: every link points somewhere real", function () {
  var targets = linkTargets(TEXT);
  // A stale scanner does not go red, it makes the loop body never run. This
  // file carried 6 broken links and well over a hundred good ones.
  assert.ok(targets.length >= 100, "links found: " + targets.length);

  var broken = targets.filter(function (t) {
    if (/^(https?:|mailto:)/.test(t.target)) return false;
    if (t.target.charAt(0) === "#") return false; // in-document anchor
    // A relative target has to be a path that exists.
    var rel = t.target.split("#")[0];
    return !fs.existsSync(path.join(__dirname, "..", rel));
  });
  assert.deepEqual(
    broken,
    [],
    "broken links: " +
      broken.map(function (b) {
        return "line " + b.line + " -> " + b.target;
      }).join("; "),
  );
});

test("CHANGELOG: no entry defers its PR link to a placeholder", function () {
  // The exact shape that shipped six times, plus the two other spellings this
  // session reached for before settling. Matched over the RAW text, code spans
  // included: a placeholder hidden in backticks still renders as one.
  var shapes = [
    /_PR link added at open_/,
    /\(\s*PR pending\s*\)/i,
    /\[#PR\]/,
  ];
  shapes.forEach(function (re) {
    var line = TEXT.split("\n").findIndex(function (l) {
      return re.test(l);
    });
    assert.equal(
      line,
      -1,
      "line " + (line + 1) + " defers its PR link: " + re,
    );
  });
});

test("CHANGELOG: the header still states the rule the tests above enforce", function () {
  // A gate whose subject has quietly left the document is a gate about nothing.
  assert.match(
    TEXT,
    /Each entry links its pull request/,
    "the changelog no longer states the rule these tests enforce",
  );
});
