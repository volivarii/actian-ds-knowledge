"use strict";

// Dist-shape snapshot test for accessibility (risk-gate #3 of the per-section
// split). Today's dist is a single file (a11y-index.json), but the snapshot
// helper handles single- or multi-file trees identically — futureproof for
// any expansion.
//
// Update intentionally with:
//   UPDATE_DIST_SNAPSHOTS=1 node --test tests/a11y-dist-shape.test.js

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");

var snapshot = require("./lib/dist-snapshot");

var DIST = path.resolve(__dirname, "..", "accessibility", "dist");
var SNAPSHOT_PATH = path.resolve(
  __dirname,
  "snapshots",
  "a11y-dist.snapshot.json",
);

test("accessibility/dist/ matches the committed snapshot (byte-identical)", function () {
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
      "No a11y dist snapshot found; one was written. Re-run tests, then commit the snapshot.",
    );
  }

  var diff = snapshot.diffSnapshots(expected, actual);
  var hasDiff =
    diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

  if (hasDiff) {
    var msg = "accessibility/dist/ drifted from snapshot:\n";
    if (diff.added.length) msg += "  added:   " + diff.added.join(", ") + "\n";
    if (diff.removed.length)
      msg += "  removed: " + diff.removed.join(", ") + "\n";
    if (diff.changed.length)
      msg += "  changed: " + diff.changed.join(", ") + "\n";
    msg +=
      "\nIf this drift is intentional (e.g. source edit), regenerate with:\n" +
      "  npm run derive:a11y && UPDATE_DIST_SNAPSHOTS=1 node --test tests/a11y-dist-shape.test.js\n" +
      "(derive:a11y script: node scripts/accessibility/derive-a11y-index.js)";
    assert.fail(msg);
  }
});
