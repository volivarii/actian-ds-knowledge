"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var vs = require("../clients/vendor-snapshot.js");

test("selectEntries: include-mode copies only listed", function () {
  assert.deepEqual(
    vs
      .selectEntries(
        ["a", "b", "scripts"],
        new Set(["a", "b"]),
        new Set(["scripts"]),
      )
      .sort(),
    ["a", "b"],
  );
});

test("selectEntries: exclude fallback when include is null", function () {
  assert.deepEqual(
    vs.selectEntries(["a", "scripts"], null, new Set(["scripts"])).sort(),
    ["a"],
  );
});

test("selectEntries: tolerates an absent excludeSet in exclusion mode (no filter, no throw)", function () {
  // A consumer pinning a pre-vendor-include snapshot (includeSet null) while
  // omitting excludeTopLevel must not crash on excludeSet.has(...).
  assert.deepEqual(vs.selectEntries(["a", "scripts"], null, undefined).sort(), [
    "a",
    "scripts",
  ]);
});

test("readVendorInclude: Set when present, null when absent/malformed", function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "vs-"));
  assert.equal(vs.readVendorInclude(dir), null);
  fs.writeFileSync(
    path.join(dir, "vendor-include.json"),
    JSON.stringify({ include: ["a"] }),
  );
  assert.ok(vs.readVendorInclude(dir) instanceof Set);
  fs.writeFileSync(path.join(dir, "vendor-include.json"), "{ bad");
  assert.equal(vs.readVendorInclude(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("matchesRange + resolveTargetTag pick the highest in-range tag", function () {
  var tags = ["v0.25.10", "v0.25.14", "v0.25.15", "v1.0.0"];
  assert.equal(vs.resolveTargetTag(tags, "<1.0.0"), "v0.25.15");
});

test("runSnapshot is exported (config-driven entry)", function () {
  assert.equal(typeof vs.runSnapshot, "function");
});
