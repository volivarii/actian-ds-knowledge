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

// stampLockfile — keep package-lock.json's two version fields in lockstep
// with a just-bumped package.json. The committed lockfile otherwise goes
// stale on the first bump, and `npm install` then rewrites it in EVERY CI
// run, leaving a dirty tree at auto-commit push time (the wave-1 --autostash
// papered over the symptom; this removes the cause). No-op (returns false)
// when the lockfile is absent, keeping the utility portable.
function stampLockfile(repoRoot, version) {
  var fsLocal = require("fs");
  var pathLocal = require("path");
  var lockPath = pathLocal.join(repoRoot, "package-lock.json");
  if (!fsLocal.existsSync(lockPath)) return false;
  var lock = JSON.parse(fsLocal.readFileSync(lockPath, "utf8"));
  lock.version = version;
  if (lock.packages && lock.packages[""]) {
    lock.packages[""].version = version;
  }
  fsLocal.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf8");
  return true;
}
module.exports.stampLockfile = stampLockfile;

// CLI: node bump-version.js <plugin.json path> <level>
// Reads, bumps, writes back. Used by GitHub workflows.
//
// Side effect: keeps the version-derived set in lockstep when run from the
// knowledge repo root. Two files move together:
//   1. package.json#version                  — primary source of truth
//   2. paths-manifest.json#knowledge_version  — asserted by tests/manifest.test.js
// The manifest sync is a no-op if the sibling artifact is absent, keeping
// the utility portable for non-knowledge consumers.
if (require.main === module) {
  var fs = require("fs");
  var path = require("path");
  var { syncKnowledgeVersion } = require("./sync-knowledge-version.js");
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

  // Sync paths-manifest.knowledge_version with package.json#version via the
  // single-writer helper. It re-reads `<repoRoot>/package.json` (which is the
  // file just bumped above in the lockstep invocation `bump-version package.json
  // <level>`) and stamps the sibling manifest. No-ops if either file is absent
  // (keeps the utility portable for tests + non-knowledge consumers).
  // path.resolve so a relative invocation from repo root yields an absolute root.
  var repoRoot = path.resolve(path.dirname(pluginJsonPath));
  if (syncKnowledgeVersion(repoRoot)) {
    process.stdout.write(
      "[bump-version] synced paths-manifest.knowledge_version -> " +
        newVersion +
        "\n",
    );
  }
  if (stampLockfile(repoRoot, newVersion)) {
    process.stdout.write(
      "[bump-version] stamped package-lock.json -> " + newVersion + "\n",
    );
  }
}
