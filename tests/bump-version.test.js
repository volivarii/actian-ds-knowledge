"use strict";

// Regression tests for scripts/lib/bump-version.js.
//
// Pure function: bumpVersion(version, level) -> newVersion.
// CLI side effect: bumps package.json#version AND syncs sibling
// paths-manifest.json#knowledge_version when one exists.
//
// The CLI sync exists because every workflow that auto-bumps package.json
// (foundations-derive, sync-from-figma, categories-derive, content-derive)
// would otherwise leave paths-manifest.json stale and break the next PR
// via tests/manifest.test.js's drift assertion.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var os = require("node:os");
var child_process = require("node:child_process");

var BUMP_VERSION_CLI = path.resolve(
  __dirname,
  "..",
  "scripts",
  "lib",
  "bump-version.js",
);
var bumpVersion = require("../scripts/lib/bump-version.js");

test("bumpVersion pure function — patch/minor/major", function () {
  assert.equal(bumpVersion("0.4.7", "patch"), "0.4.8");
  assert.equal(bumpVersion("0.4.7", "minor"), "0.5.0");
  assert.equal(bumpVersion("0.4.7", "major"), "1.0.0");
});

test("bumpVersion pure function — rejects invalid input", function () {
  assert.throws(function () {
    bumpVersion("not-a-version", "patch");
  }, /Invalid semver/);
  assert.throws(function () {
    bumpVersion("1.0.0", "bogus");
  }, /Invalid level/);
});

test("CLI bumps package.json AND syncs sibling paths-manifest.knowledge_version", function () {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-version-test-"));
  try {
    var pkgPath = path.join(tmpDir, "package.json");
    var manifestPath = path.join(tmpDir, "paths-manifest.json");

    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: "test", version: "0.4.0" }, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          manifest_schema_version: "v1",
          knowledge_version: "0.4.0",
          paths: {},
          collections: {},
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    var result = child_process.spawnSync(
      process.execPath,
      [BUMP_VERSION_CLI, pkgPath, "patch"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, "CLI exit code: " + result.stderr);

    var pkgAfter = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    assert.equal(pkgAfter.version, "0.4.1", "package.json bumped");

    var manifestAfter = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(
      manifestAfter.knowledge_version,
      "0.4.1",
      "paths-manifest.knowledge_version synced",
    );
    // Schema-format version must be untouched.
    assert.equal(manifestAfter.manifest_schema_version, "v1");
    // CLI emits both lines on stdout.
    assert.match(result.stdout, /0\.4\.0 -> 0\.4\.1/);
    assert.match(result.stdout, /synced paths-manifest\.knowledge_version/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI is a no-op on manifest when no sibling paths-manifest.json exists", function () {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-version-test-"));
  try {
    var pkgPath = path.join(tmpDir, "package.json");
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: "test", version: "1.0.0" }, null, 2) + "\n",
      "utf8",
    );

    var result = child_process.spawnSync(
      process.execPath,
      [BUMP_VERSION_CLI, pkgPath, "minor"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, "CLI exit code: " + result.stderr);

    var pkgAfter = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    assert.equal(pkgAfter.version, "1.1.0");
    // No manifest written, no sync line emitted.
    assert.doesNotMatch(result.stdout, /synced paths-manifest/);
    assert.equal(
      fs.existsSync(path.join(tmpDir, "paths-manifest.json")),
      false,
      "no manifest was created",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI does not rewrite paths-manifest.json if knowledge_version already matches", function () {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-version-test-"));
  try {
    var pkgPath = path.join(tmpDir, "package.json");
    var manifestPath = path.join(tmpDir, "paths-manifest.json");

    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: "test", version: "2.0.0" }, null, 2) + "\n",
      "utf8",
    );
    // Pre-set manifest to the post-bump value so the bump produces no diff.
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        { manifest_schema_version: "v1", knowledge_version: "2.0.1", paths: {} },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    var statBefore = fs.statSync(manifestPath).mtimeMs;

    // Spawn after a tiny pause so mtime resolution can differ if write occurs.
    var waitUntil = Date.now() + 20;
    while (Date.now() < waitUntil) {
      /* spin */
    }

    var result = child_process.spawnSync(
      process.execPath,
      [BUMP_VERSION_CLI, pkgPath, "patch"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0);

    var statAfter = fs.statSync(manifestPath).mtimeMs;
    assert.equal(statAfter, statBefore, "manifest file untouched on no-op");
    assert.doesNotMatch(result.stdout, /synced paths-manifest/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
