"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var {
  insertSyncChangelog,
} = require("../scripts/sync/insert-sync-changelog.js");

var FIXTURE = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "### Added",
  "- Nothing yet.",
  "",
  "## [0.34.71] - 2026-07-05",
  "",
  "### Added",
  "- Something.",
  "",
].join("\n");

var OPTS = {
  pr: 360,
  date: "2026-07-06",
  repo: "volivarii/actian-ds-knowledge",
};

test("inserts a breaking-sync entry directly under Unreleased", function () {
  var r = insertSyncChangelog(FIXTURE, OPTS);
  assert.equal(r.inserted, true);
  var unreleasedIdx = r.content.indexOf("## [Unreleased]");
  var entryIdx = r.content.indexOf("Breaking Figma sync (2026-07-06)");
  var releasedIdx = r.content.indexOf("## [0.34.71]");
  assert.ok(entryIdx > unreleasedIdx, "entry sits after Unreleased heading");
  assert.ok(entryIdx < releasedIdx, "entry sits before the released section");
  assert.match(
    r.content,
    /\[#360\]\(https:\/\/github\.com\/volivarii\/actian-ds-knowledge\/pull\/360\)/,
  );
});

test("idempotent per PR number (workflow retry must not duplicate)", function () {
  var first = insertSyncChangelog(FIXTURE, OPTS);
  var second = insertSyncChangelog(first.content, OPTS);
  assert.equal(second.inserted, false);
  assert.equal(second.content, first.content);
  var occurrences = second.content.split("[#360]").length - 1;
  assert.equal(occurrences, 1, "exactly one entry for PR #360");
});

test("no Unreleased heading: refuses to guess, leaves content untouched", function () {
  var r = insertSyncChangelog("# Changelog\n\n## [1.0.0]\n", OPTS);
  assert.equal(r.inserted, false);
  assert.equal(r.content, "# Changelog\n\n## [1.0.0]\n");
});
