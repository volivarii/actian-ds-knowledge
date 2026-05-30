"use strict";

// Single writer for paths-manifest.json#knowledge_version.
//
// package.json#version is the SINGLE SOURCE OF TRUTH for the knowledge
// version. tests/manifest.test.js asserts knowledge_version === pkg.version
// on every sync, so the two must move in lockstep. This module stamps the
// manifest's knowledge_version FROM package.json — it derives, never invents.
//
// Two writers route through here (one logical writer of the field):
//   - scripts/lib/bump-version.js   (CLI: after bumping package.json)
//   - scripts/sync/sync-from-figma.js (nightly auto-bump on additive/breaking)
//
// Formatting matches manifest-io.writeManifest exactly (canonical key order +
// 2-space indent + trailing newline) so a synced repo is byte-identical and
// re-writing never produces a spurious diff. Dependency-free (node builtins +
// the repo-local manifest writer).

var fs = require("node:fs");
var path = require("node:path");
var { writeManifest } = require("./manifest-io.js");

// Stamp <root>/paths-manifest.json#knowledge_version from <root>/package.json
// #version. Returns true if the manifest was changed (and rewritten), false
// if already in sync (no write — a true no-op, keeping a synced repo
// byte-identical). No-op (returns false) if either file is absent, keeping
// the helper portable for non-knowledge consumers.
//
// repoRoot defaults to the knowledge repo root resolved relative to this file
// (scripts/lib/ -> scripts/ -> repo root).
function syncKnowledgeVersion(repoRoot) {
  var root = repoRoot || path.resolve(__dirname, "..", "..");
  var pkgPath = path.join(root, "package.json");
  var manifestPath = path.join(root, "paths-manifest.json");

  if (!fs.existsSync(pkgPath) || !fs.existsSync(manifestPath)) {
    return false;
  }

  var version = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
  var manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  if (manifest.knowledge_version === version) {
    return false;
  }

  manifest.knowledge_version = version;
  writeManifest(manifestPath, manifest);
  return true;
}

module.exports = { syncKnowledgeVersion: syncKnowledgeVersion };

// CLI: node scripts/lib/sync-knowledge-version.js
if (require.main === module) {
  var changed = syncKnowledgeVersion();
  console.log(
    changed
      ? "[sync:version] stamped knowledge_version"
      : "[sync:version] already in sync",
  );
}
