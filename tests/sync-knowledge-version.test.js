"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  syncKnowledgeVersion,
} = require("../scripts/lib/sync-knowledge-version.js");

function tmpRepo(pkgVersion, manifestVersion) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kv-"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "x", version: pkgVersion }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(dir, "paths-manifest.json"),
    JSON.stringify(
      {
        manifest_schema_version: "v1",
        knowledge_version: manifestVersion,
        paths: {},
        collections: {},
      },
      null,
      2,
    ) + "\n",
  );
  return dir;
}

test("stamps knowledge_version from package.json when they differ", () => {
  const dir = tmpRepo("0.25.9", "0.25.5");
  const changed = syncKnowledgeVersion(dir);
  assert.equal(changed, true);
  const m = JSON.parse(
    fs.readFileSync(path.join(dir, "paths-manifest.json"), "utf8"),
  );
  assert.equal(m.knowledge_version, "0.25.9");
});

test("no-op (returns false, no rewrite) when already synced", () => {
  const dir = tmpRepo("0.25.9", "0.25.9");
  const before = fs.readFileSync(path.join(dir, "paths-manifest.json"), "utf8");
  const changed = syncKnowledgeVersion(dir);
  assert.equal(changed, false);
  assert.equal(
    fs.readFileSync(path.join(dir, "paths-manifest.json"), "utf8"),
    before,
  );
});

test("only knowledge_version changes — other manifest fields untouched", () => {
  const dir = tmpRepo("1.0.0", "0.9.0");
  syncKnowledgeVersion(dir);
  const m = JSON.parse(
    fs.readFileSync(path.join(dir, "paths-manifest.json"), "utf8"),
  );
  assert.equal(m.manifest_schema_version, "v1");
  assert.deepEqual(m.paths, {});
});

test("no-op (returns false) when package.json / manifest absent — portable for non-knowledge dirs", () => {
  // The helper is also called from generic dirs (bump-version on non-knowledge
  // JSON, sync-from-figma when the sibling manifest is absent). It must no-op,
  // not throw.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kv-empty-"));
  assert.equal(syncKnowledgeVersion(dir), false);
});
