"use strict";

// Dist-shape snapshot test (risk-gate #3 for the per-section split).
//
// Captures a SHA-256 hash of every file under foundations/dist/ and asserts
// the tree matches the committed snapshot. The pre-split snapshot is locked
// here; the Day 2/3 split refactor MUST produce byte-identical dist (same
// paths, same hashes). Any drift fails this test and surfaces exactly which
// files changed.
//
// Update intentionally with:
//   UPDATE_DIST_SNAPSHOTS=1 node --test tests/foundations-dist-shape.test.js

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");

var snapshot = require("./lib/dist-snapshot");

var DIST = path.resolve(__dirname, "..", "foundations", "dist");
var SNAPSHOT_PATH = path.resolve(
  __dirname,
  "snapshots",
  "foundations-dist.snapshot.json",
);

test("foundations/dist/ matches the committed snapshot (byte-identical)", function () {
  var actual = snapshot.snapshotDist(DIST);

  if (snapshot.shouldUpdate()) {
    snapshot.writeSnapshot(SNAPSHOT_PATH, actual);
    console.log("Updated " + SNAPSHOT_PATH);
    return;
  }

  var expected = snapshot.readSnapshot(SNAPSHOT_PATH);
  if (!expected) {
    snapshot.writeSnapshot(SNAPSHOT_PATH, actual);
    assert.fail(
      "No foundations dist snapshot found; one was written. Re-run tests, then commit the snapshot.",
    );
  }

  var diff = snapshot.diffSnapshots(expected, actual);
  var hasDiff =
    diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

  if (hasDiff) {
    var msg = "foundations/dist/ drifted from snapshot:\n";
    if (diff.added.length) msg += "  added:   " + diff.added.join(", ") + "\n";
    if (diff.removed.length)
      msg += "  removed: " + diff.removed.join(", ") + "\n";
    if (diff.changed.length)
      msg += "  changed: " + diff.changed.join(", ") + "\n";
    msg +=
      "\nIf this drift is intentional (e.g. source edit), regenerate with:\n" +
      "  npm run derive:foundations && UPDATE_DIST_SNAPSHOTS=1 node --test tests/foundations-dist-shape.test.js";
    assert.fail(msg);
  }
});
