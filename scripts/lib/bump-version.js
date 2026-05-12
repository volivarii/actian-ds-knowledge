"use strict";

// Pure semver bump utility used by the auto-sync GitHub Action workflow and
// foundations-derive workflow to PATCH-bump plugin.json when generated data
// (registries, styles, foundations JSONs) changes.
//
// Returns the bumped version string. Throws on invalid semver or unknown
// level. No I/O — caller reads/writes plugin.json.

var SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
var LEVELS = ["major", "minor", "patch"];

function bumpVersion(version, level) {
  if (LEVELS.indexOf(level) === -1) {
    throw new Error(
      "Invalid level: " +
        level +
        " (expected one of: " +
        LEVELS.join(", ") +
        ")",
    );
  }
  var match = SEMVER_RE.exec(version);
  if (!match) {
    throw new Error(
      "Invalid semver: " +
        version +
        " (expected x.y.z with non-negative integers)",
    );
  }
  var major = parseInt(match[1], 10);
  var minor = parseInt(match[2], 10);
  var patch = parseInt(match[3], 10);

  if (level === "major") return major + 1 + ".0.0";
  if (level === "minor") return major + "." + (minor + 1) + ".0";
  return major + "." + minor + "." + (patch + 1);
}

module.exports = bumpVersion;

// CLI: node bump-version.js <plugin.json path> <level>
// Reads, bumps, writes back. Used by GitHub workflows.
//
// Side effect: also keeps paths-manifest.json#knowledge_version in lockstep
// with package.json#version when a sibling paths-manifest.json exists next
// to the bumped JSON file. tests/manifest.test.js asserts the two stay
// equal, so every CI auto-bump (foundations-derive, sync-from-figma,
// categories-derive, content-derive) would otherwise create drift and
// break the next PR. Centralized here so every caller inherits the sync.
if (require.main === module) {
  var fs = require("fs");
  var path = require("path");
  var args = process.argv.slice(2);
  if (args.length !== 2) {
    process.stderr.write(
      "Usage: bump-version.js <plugin.json path> <patch|minor|major>\n",
    );
    process.exit(1);
  }
  var pluginJsonPath = args[0];
  var level = args[1];
  var plugin = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
  var oldVersion = plugin.version;
  var newVersion = bumpVersion(oldVersion, level);
  plugin.version = newVersion;
  fs.writeFileSync(
    pluginJsonPath,
    JSON.stringify(plugin, null, 2) + "\n",
    "utf8",
  );
  process.stdout.write(oldVersion + " -> " + newVersion + "\n");

  // Sync paths-manifest.knowledge_version with package.json#version.
  // Lives in the same directory as the bumped JSON file. No-op if absent
  // (keeps the utility portable — tests + non-knowledge consumers unaffected).
  var manifestPath = path.join(
    path.dirname(pluginJsonPath),
    "paths-manifest.json",
  );
  if (fs.existsSync(manifestPath)) {
    var manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.knowledge_version !== newVersion) {
      manifest.knowledge_version = newVersion;
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(manifest, null, 2) + "\n",
        "utf8",
      );
      process.stdout.write(
        "[bump-version] synced paths-manifest.knowledge_version -> " +
          newVersion +
          "\n",
      );
    }
  }
}
