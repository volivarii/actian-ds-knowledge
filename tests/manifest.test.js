"use strict";

// Tests for paths-manifest.json schema correctness. Tests run against
// the LIVE manifest, not fixtures, so they double as drift detection.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "paths-manifest.json");

test("paths-manifest.json — schema correctness", async (t) => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  await t.test("has required top-level fields", () => {
    assert.equal(manifest.manifest_schema_version, "v1");
    assert.ok(manifest.knowledge_version, "knowledge_version is set");
    assert.ok(manifest.paths, "paths object exists");
    assert.ok(manifest.collections, "collections object exists");
    assert.ok(manifest.aliases !== undefined, "aliases field present");
    assert.ok(
      manifest.registryAliases !== undefined,
      "registryAliases field present",
    );
  });

  await t.test("knowledge_version matches package.json#version", () => {
    // knowledge_version is the data-content version (vs manifest_schema_version
    // which is the schema-format version). Plugin's vendor-snapshot writes the
    // resolved tag into vendored.json#resolved_version; the vendored manifest's
    // knowledge_version must match that for snapshot integrity. Both fields
    // must equal package.json#version — this test catches drift before publish.
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
    );
    assert.equal(
      manifest.knowledge_version,
      pkg.version,
      `Version mismatch: knowledge_version (${manifest.knowledge_version}) != package.json version (${pkg.version}). If you hand-edited the version, REVERT it — both fields should match main. CI bumps them together automatically; contributors should not change versions. See the "Contributing a change?" section in CLAUDE.md.`,
    );
  });

  await t.test("every path entry has required fields", () => {
    for (const [name, entry] of Object.entries(manifest.paths)) {
      assert.ok(entry.path, `${name}: missing path`);
      assert.ok(entry.type, `${name}: missing type`);
      assert.ok(entry.origin, `${name}: missing origin`);
      assert.ok(entry.description, `${name}: missing description`);
      assert.ok(
        ["markdown", "json", "css"].includes(entry.type),
        `${name}: invalid type "${entry.type}"`,
      );
      assert.ok(
        ["human", "ci", "hybrid"].includes(entry.origin),
        `${name}: invalid origin "${entry.origin}"`,
      );
      if (entry.origin === "ci") {
        assert.ok(entry.generator, `${name}: ci entry missing generator field`);
      }
    }
  });

  await t.test("every collection entry has required fields", () => {
    for (const [name, entry] of Object.entries(manifest.collections)) {
      assert.ok(entry.dir, `${name}: missing dir`);
      assert.ok(entry.pattern, `${name}: missing pattern`);
      assert.ok(entry.type, `${name}: missing type`);
      assert.ok(entry.origin, `${name}: missing origin`);
      assert.ok(entry.description, `${name}: missing description`);
    }
  });

  await t.test("no key conflicts between paths and collections", () => {
    const pathKeys = new Set(Object.keys(manifest.paths));
    for (const collKey of Object.keys(manifest.collections)) {
      assert.ok(
        !pathKeys.has(collKey),
        `Collection "${collKey}" conflicts with paths entry of same name`,
      );
    }
  });

  await t.test("every path entry resolves to a real file", () => {
    for (const [name, entry] of Object.entries(manifest.paths)) {
      const fullPath = path.join(REPO_ROOT, entry.path);
      assert.ok(
        fs.existsSync(fullPath),
        `${name}: path ${entry.path} does not exist`,
      );
    }
  });

  await t.test("every collection dir resolves to a real directory", () => {
    for (const [name, entry] of Object.entries(manifest.collections)) {
      const fullPath = path.join(REPO_ROOT, entry.dir);
      assert.ok(
        fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory(),
        `${name}: dir ${entry.dir} does not exist or is not a directory`,
      );
    }
  });

  await t.test(
    "content.section collection is recursive and bucket-patterned",
    () => {
      // Phase 2c (knowledge v0.10.0): content/src/ split into 3 sub-buckets
      // (writing/, patterns/, product/) plus root-level meta files. The
      // manifest collection must be recursive and use a bucket-aware pattern
      // so consumers (plugin, docs site) discover all section files.
      const coll = manifest.collections["content.section"];
      assert.ok(coll, "content.section collection must exist");
      assert.equal(coll.dir, "content/src");
      assert.equal(coll.pattern, "{bucket}/{slug}.md");
      assert.equal(coll.recursive, true);
    },
  );

  await t.test(
    "components.images collection is declared (recursive, binary)",
    () => {
      // Phase 2c convention: authors may opt-in to per-component static
      // visual assets at components/src/<slug>/images/. The collection is
      // declared even when no component currently authors images — opt-in.
      const coll = manifest.collections["components.images"];
      assert.ok(coll, "components.images collection must exist");
      assert.equal(coll.recursive, true);
      assert.equal(coll.type, "binary");
      assert.ok(
        coll.pattern.includes("images"),
        `pattern ${coll.pattern} should reference images dir`,
      );
    },
  );

  await t.test("knowledge_version is at least 0.10.0", () => {
    // Phase 2c shipped the breaking content.section pattern change at
    // knowledge_version 0.10.0. Consumers pinning <0.10 will still read
    // the old flat layout off prior tags.
    const [maj, min] = manifest.knowledge_version.split(".").map(Number);
    assert.ok(
      maj > 0 || (maj === 0 && min >= 10),
      `knowledge_version ${manifest.knowledge_version} is below 0.10.0 — Phase 2c sub-bucket migration requires the bump`,
    );
  });

  await t.test("every registryAlias key and value resolves", () => {
    // registryAliases bridges registry component keys -> guidelineDoc slugs.
    // A key that isn't a real registry component, or a value with no guideline
    // doc, is a dead alias — catch it here rather than letting the plugin's
    // lookup silently return nothing. See _notes.registry_aliases_interim.
    const dskit = JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, "components/dist/registries/dskit.json"),
        "utf8",
      ),
    );
    const registryKeys = new Set(Object.keys(dskit.components || {}));
    for (const [from, to] of Object.entries(manifest.registryAliases)) {
      assert.ok(
        registryKeys.has(from),
        `registryAliases: key "${from}" is not a dskit.json component key`,
      );
      const guidelinePath = path.join(
        REPO_ROOT,
        "components/dist/guidelines",
        `${to}.json`,
      );
      assert.ok(
        fs.existsSync(guidelinePath),
        `registryAliases: "${from}" -> "${to}" but components/dist/guidelines/${to}.json does not exist`,
      );
      // The alias OUTPUT file must also exist — catches "added an alias entry
      // but never re-ran the deriver" independently of the workflow trigger.
      const aliasPath = path.join(
        REPO_ROOT,
        "components/dist/guidelines",
        `${from}.json`,
      );
      assert.ok(
        fs.existsSync(aliasPath),
        `registryAliases: "${from}" has no alias file components/dist/guidelines/${from}.json — run npm run derive:guidelines`,
      );
    }
  });
});
