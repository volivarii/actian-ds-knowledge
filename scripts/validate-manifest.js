#!/usr/bin/env node
"use strict";

// Validates paths-manifest.json: every path resolves, no orphan files.
// Run: npm run validate:manifest
// Exit 0 on success, non-zero on any violation.

var fs = require("fs");
var path = require("path");

var REPO_ROOT = path.resolve(__dirname, "..");
var MANIFEST_PATH = path.join(REPO_ROOT, "paths-manifest.json");

// Top-level domain dirs subject to manifest coverage.
// Excludes: scripts/, .github/, node_modules/, tests/, release-notes/.
var CONTENT_DIRS = [
  "foundations",
  "components",
  "tokens",
  "content",
  "accessibility",
  "app-context",
];

// Files inside content dirs that don't need manifest entries.
var EXCLUDED_FILES = new Set(["README.md", "AUTHORING.md", ".DS_Store"]);

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error("paths-manifest.json not found at " + MANIFEST_PATH);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function validateSchema(manifest) {
  var errors = [];
  if (manifest.manifest_schema_version !== "v1") {
    errors.push(
      "manifest_schema_version must be 'v1', got: " +
        manifest.manifest_schema_version,
    );
  }
  if (!manifest.paths || typeof manifest.paths !== "object") {
    errors.push("paths must be an object");
    return errors;
  }
  if (!manifest.collections || typeof manifest.collections !== "object") {
    errors.push("collections must be an object");
  }

  for (var name in manifest.paths) {
    var entry = manifest.paths[name];
    if (!entry.path) errors.push("paths." + name + ": missing 'path'");
    if (!entry.type) errors.push("paths." + name + ": missing 'type'");
    if (!entry.origin) errors.push("paths." + name + ": missing 'origin'");
    if (!entry.description) {
      errors.push("paths." + name + ": missing 'description'");
    }
    if (["markdown", "json", "css"].indexOf(entry.type) === -1) {
      errors.push("paths." + name + ": invalid type '" + entry.type + "'");
    }
    if (["human", "ci", "hybrid"].indexOf(entry.origin) === -1) {
      errors.push("paths." + name + ": invalid origin '" + entry.origin + "'");
    }
    if (entry.origin === "ci" && !entry.generator) {
      errors.push("paths." + name + ": ci origin requires 'generator' field");
    }
  }

  for (var collName in manifest.collections) {
    var coll = manifest.collections[collName];
    if (!coll.dir) errors.push("collections." + collName + ": missing 'dir'");
    if (!coll.pattern) {
      errors.push("collections." + collName + ": missing 'pattern'");
    }
    if (!coll.type) errors.push("collections." + collName + ": missing 'type'");
    if (!coll.origin) {
      errors.push("collections." + collName + ": missing 'origin'");
    }
    if (!coll.description) {
      errors.push("collections." + collName + ": missing 'description'");
    }
  }

  // No path/collection name conflicts
  var pathNames = Object.keys(manifest.paths);
  for (var c in manifest.collections) {
    if (pathNames.indexOf(c) !== -1) {
      errors.push(
        "name conflict: '" + c + "' exists as both path and collection",
      );
    }
  }

  return errors;
}

function validatePathsExist(manifest) {
  var errors = [];
  for (var name in manifest.paths) {
    var entry = manifest.paths[name];
    var full = path.join(REPO_ROOT, entry.path);
    if (!fs.existsSync(full)) {
      errors.push("path '" + name + "' references missing file: " + entry.path);
    }
  }
  for (var collName in manifest.collections) {
    var coll = manifest.collections[collName];
    var dirFull = path.join(REPO_ROOT, coll.dir);
    if (!fs.existsSync(dirFull) || !fs.statSync(dirFull).isDirectory()) {
      errors.push(
        "collection '" +
          collName +
          "' references missing directory: " +
          coll.dir,
      );
    }
  }
  return errors;
}

function gatherCoveredFiles(manifest) {
  var covered = new Set();
  for (var name in manifest.paths) {
    covered.add(manifest.paths[name].path);
  }
  for (var collName in manifest.collections) {
    var coll = manifest.collections[collName];
    var dir = path.join(REPO_ROOT, coll.dir);
    if (!fs.existsSync(dir)) continue;
    // Recursive collections (Pattern H — hierarchical leaf trees) declare
    // `recursive: true`. Default is flat (one level).
    if (coll.recursive) {
      var rels = walkDir(coll.dir);
      for (var r = 0; r < rels.length; r++) covered.add(rels[r]);
      continue;
    }
    var entries = fs.readdirSync(dir);
    for (var i = 0; i < entries.length; i++) {
      if (!EXCLUDED_FILES.has(entries[i])) {
        covered.add(path.join(coll.dir, entries[i]));
      }
    }
  }
  return covered;
}

function walkDir(relDir) {
  var results = [];
  var full = path.join(REPO_ROOT, relDir);
  if (!fs.existsSync(full)) return results;
  var entries = fs.readdirSync(full);
  for (var i = 0; i < entries.length; i++) {
    var name = entries[i];
    if (name.startsWith(".")) continue;
    if (EXCLUDED_FILES.has(name)) continue;
    var rel = path.join(relDir, name);
    var fullPath = path.join(REPO_ROOT, rel);
    if (fs.statSync(fullPath).isDirectory()) {
      results = results.concat(walkDir(rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

// Domains that live in the working tree but are NOT yet part of the declared
// distributable manifest surface, so the orphan guard must not flag them.
// components/render/ is the canonical component render library (North Star slice
// 1): the seed src is tracked because a CI test reads it, but the domain is not
// declared distributable until slice 1b adds its vendor include + CI derive
// workflow, which also adds proper manifest coverage and removes this skip.
var ORPHAN_SKIP_PREFIXES = [path.join("components", "render") + path.sep];

function validateNoOrphans(manifest) {
  var errors = [];
  var covered = gatherCoveredFiles(manifest);
  for (var i = 0; i < CONTENT_DIRS.length; i++) {
    var files = walkDir(CONTENT_DIRS[i]);
    for (var j = 0; j < files.length; j++) {
      var skip = ORPHAN_SKIP_PREFIXES.some(function (p) {
        return files[j].indexOf(p) === 0;
      });
      if (skip) continue;
      if (!covered.has(files[j])) {
        errors.push("orphan file (not covered by manifest): " + files[j]);
      }
    }
  }
  return errors;
}

function validateZones(manifest) {
  var errors = [];
  var z = manifest._zones;
  if (!z || typeof z !== "object") {
    errors.push("manifest missing '_zones' block");
    return errors;
  }
  var declared = {};
  Object.keys(z).forEach(function (key) {
    if (!Array.isArray(z[key])) return; // skip _comment and other scalars
    z[key].forEach(function (prefix) {
      declared[prefix] = key;
    });
  });
  var prefixes = {};
  for (var name in manifest.paths) prefixes[name.split(".")[0]] = true;
  for (var coll in manifest.collections) prefixes[coll.split(".")[0]] = true;
  for (var p in prefixes) {
    if (!(p in declared)) {
      errors.push("zone: prefix '" + p + "' not classified in _zones");
    }
  }
  return errors;
}

function main() {
  var manifest = readManifest();
  var errors = []
    .concat(validateSchema(manifest))
    .concat(validatePathsExist(manifest))
    .concat(validateNoOrphans(manifest))
    .concat(validateZones(manifest));

  if (errors.length === 0) {
    console.log(
      "[validate-manifest] OK — " +
        Object.keys(manifest.paths).length +
        " paths, " +
        Object.keys(manifest.collections).length +
        " collections, no orphans",
    );
    process.exit(0);
  }
  console.error(
    "[validate-manifest] FAILED with " + errors.length + " errors:",
  );
  for (var k = 0; k < errors.length; k++) {
    console.error("  - " + errors[k]);
  }
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  readManifest: readManifest,
  validateSchema: validateSchema,
  validatePathsExist: validatePathsExist,
  validateNoOrphans: validateNoOrphans,
  validateZones: validateZones,
};
