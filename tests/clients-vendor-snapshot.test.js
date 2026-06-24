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

test("githubCurlArgs: -sSL only when no token; adds auth header when a token is set; GH_TOKEN wins over GITHUB_TOKEN", function () {
  var saved = { gh: process.env.GH_TOKEN, gt: process.env.GITHUB_TOKEN };
  try {
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    assert.deepEqual(vs.githubCurlArgs(["URL"]), ["-sSL", "URL"]);

    process.env.GH_TOKEN = "ghs_abc";
    assert.deepEqual(vs.githubCurlArgs(["URL"]), [
      "-sSL",
      "-H",
      "Authorization: Bearer ghs_abc",
      "URL",
    ]);

    // GITHUB_TOKEN is the fallback; extra args (e.g. -o dest) are preserved.
    delete process.env.GH_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_xyz";
    assert.deepEqual(vs.githubCurlArgs(["-o", "dest", "URL"]), [
      "-sSL",
      "-H",
      "Authorization: Bearer ghp_xyz",
      "-o",
      "dest",
      "URL",
    ]);

    // GH_TOKEN takes precedence when both are present.
    process.env.GH_TOKEN = "ghs_abc";
    assert.deepEqual(vs.githubCurlArgs(["URL"]), [
      "-sSL",
      "-H",
      "Authorization: Bearer ghs_abc",
      "URL",
    ]);
  } finally {
    if (saved.gh === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = saved.gh;
    if (saved.gt === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = saved.gt;
  }
});

test("runSnapshot THROWS (does not process.exit) when no SHA is resolvable", function () {
  // Library owns no CLI shell: a fatal condition throws for the consumer's
  // wrapper to catch. Network-free path — empty argv + absent vendored.json +
  // no range → falls straight through to the no-SHA guard.
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "vs-run-"));
  assert.throws(function () {
    vs.runSnapshot(
      {
        knowledgeRepo: "owner/repo",
        vendorDir: path.join(dir, "vendor"),
        vendoredJsonPath: path.join(dir, "vendored.json"),
        excludeTopLevel: new Set(),
      },
      [],
    );
  }, /no SHA available/);
  fs.rmSync(dir, { recursive: true, force: true });
});
