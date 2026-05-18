"use strict";

// Regression tests for scripts/lib/bump-version.js.
//
// Pure function: bumpVersion(version, level) -> newVersion.
// CLI side effect: bumps package.json#version AND keeps two derived
// artifacts in lockstep when their siblings exist:
//   - paths-manifest.json#knowledge_version (asserted by tests/manifest.test.js)
//   - MAP.md (asserted by .github/workflows/manifest-coverage.yml)
//
// The CLI sync exists because every workflow that auto-bumps package.json
// (foundations-derive, sync-from-figma, categories-derive, content-derive)
// would otherwise leave the derived artifacts stale and break the next PR.

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

test("CLI regenerates MAP.md when sibling scripts/generate-map.js + MAP.md exist", function () {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-version-test-"));
  try {
    var pkgPath = path.join(tmpDir, "package.json");
    var manifestPath = path.join(tmpDir, "paths-manifest.json");
    var mapPath = path.join(tmpDir, "MAP.md");
    var scriptsDir = path.join(tmpDir, "scripts");
    fs.mkdirSync(scriptsDir);

    // Vendor a minimal generate-map.js into the tmp repo so the CLI's
    // require() resolves. Mirrors the real script's contract (manifest in,
    // string out) without coupling tests to formatting of the real template.
    fs.writeFileSync(
      path.join(scriptsDir, "generate-map.js"),
      [
        '"use strict";',
        "function generateMap(manifest) {",
        '  return "# MAP\\nversion: " + manifest.knowledge_version + "\\n";',
        "}",
        "module.exports = { generateMap };",
      ].join("\n"),
      "utf8",
    );

    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: "test", version: "0.5.0" }, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          manifest_schema_version: "v1",
          knowledge_version: "0.5.0",
          paths: {},
          collections: {},
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    // Pre-existing MAP.md is intentionally stale (still at 0.5.0).
    fs.writeFileSync(mapPath, "# MAP\nversion: 0.5.0\n", "utf8");

    var result = child_process.spawnSync(
      process.execPath,
      [BUMP_VERSION_CLI, pkgPath, "patch"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, "CLI exit code: " + result.stderr);

    var mapAfter = fs.readFileSync(mapPath, "utf8");
    assert.equal(
      mapAfter,
      "# MAP\nversion: 0.5.1\n",
      "MAP.md regenerated with bumped version",
    );
    assert.match(result.stdout, /regenerated MAP\.md/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI regenerates MAP.md when invoked with a RELATIVE path (regression for require() resolution)", function () {
  // Regression: when CI workflows invoke `node scripts/lib/bump-version.js
  // package.json minor` from the repo root, pluginJsonPath is the relative
  // string "package.json". The MAP regen used path.join(path.dirname(arg))
  // which produced "scripts/generate-map.js" — a string require() doesn't
  // accept as a CommonJS module ID. Fix: path.resolve so repoRoot is always
  // absolute. This test runs the CLI with cwd set to a tmp dir so the
  // relative path resolves correctly there.
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-version-test-"));
  try {
    var scriptsDir = path.join(tmpDir, "scripts");
    fs.mkdirSync(scriptsDir);
    fs.writeFileSync(
      path.join(scriptsDir, "generate-map.js"),
      [
        '"use strict";',
        "function generateMap(manifest) {",
        '  return "# MAP\\nversion: " + manifest.knowledge_version + "\\n";',
        "}",
        "module.exports = { generateMap };",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "test", version: "0.6.0" }, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "paths-manifest.json"),
      JSON.stringify(
        {
          manifest_schema_version: "v1",
          knowledge_version: "0.6.0",
          paths: {},
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "MAP.md"),
      "# MAP\nversion: 0.6.0\n",
      "utf8",
    );

    // Invoke with RELATIVE path + cwd set to tmpDir — mirrors how CI runs it.
    var result = child_process.spawnSync(
      process.execPath,
      [BUMP_VERSION_CLI, "package.json", "patch"],
      { encoding: "utf8", cwd: tmpDir },
    );
    assert.equal(result.status, 0, "CLI exit code: " + result.stderr);
    assert.match(result.stdout, /regenerated MAP\.md/);
    assert.equal(
      fs.readFileSync(path.join(tmpDir, "MAP.md"), "utf8"),
      "# MAP\nversion: 0.6.1\n",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI is a no-op on MAP.md when scripts/generate-map.js is absent", function () {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-version-test-"));
  try {
    var pkgPath = path.join(tmpDir, "package.json");
    var manifestPath = path.join(tmpDir, "paths-manifest.json");
    var mapPath = path.join(tmpDir, "MAP.md");

    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: "test", version: "0.5.0" }, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          manifest_schema_version: "v1",
          knowledge_version: "0.5.0",
          paths: {},
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    // MAP.md exists but no scripts/generate-map.js — CLI must not touch it.
    var staleMap = "# stale MAP\n";
    fs.writeFileSync(mapPath, staleMap, "utf8");

    var result = child_process.spawnSync(
      process.execPath,
      [BUMP_VERSION_CLI, pkgPath, "patch"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0);
    assert.equal(
      fs.readFileSync(mapPath, "utf8"),
      staleMap,
      "MAP.md untouched",
    );
    assert.doesNotMatch(result.stdout, /regenerated MAP\.md/);
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
        {
          manifest_schema_version: "v1",
          knowledge_version: "2.0.1",
          paths: {},
        },
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
