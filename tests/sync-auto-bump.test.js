"use strict";

// Regression test for v0.3.7 Fix 1: sync orchestrator auto-bump now writes
// BOTH package.json#version AND paths-manifest.json#knowledge_version when
// the verdict is additive/breaking. Previously only package.json was bumped,
// which broke tests/manifest.test.js's `knowledge_version === pkg.version`
// assertion on every sync until manually fixed.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const sync = require(
  path.join(__dirname, "..", "scripts", "sync", "sync-from-figma.js"),
);

// Minimal fake REST surface. Returns an empty file for dsKit + fmKit so
// those verdicts are unchanged, and exactly ONE standalone component for
// metaKit so its verdict is additive — driving the overall verdict to
// additive and triggering the auto-bump block.
function makeFakeRest() {
  return {
    getComponentSets: async function () {
      return { meta: { component_sets: [] } };
    },
    getComponents: async function (fileKey) {
      // Only metaKit returns a component; the other kits return empty.
      if (fileKey === "META_KEY") {
        return {
          meta: {
            components: [
              {
                key: "k-meta-1",
                name: "DemoMetaComp",
                node_id: "10:1",
                description: "",
                containing_frame: {},
              },
            ],
          },
        };
      }
      return { meta: { components: [] } };
    },
    getNodes: async function () {
      return { nodes: {} };
    },
    getFile: async function () {
      return { document: { children: [] } };
    },
    getStyles: async function () {
      return { meta: { styles: [] } };
    },
  };
}

test("sync auto-bump — writes both package.json AND paths-manifest.json when additive", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-bump-"));
  try {
    const pkgPath = path.join(tmpdir, "package.json");
    const manifestPath = path.join(tmpdir, "paths-manifest.json");
    const outputDir = path.join(tmpdir, "components", "dist", "registries");
    const releaseNotesDir = path.join(tmpdir, "release-notes");
    const artifactsDir = path.join(tmpdir, "tmp-artifacts");

    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          manifest_schema_version: "v1",
          knowledge_version: "1.0.0",
          paths: {},
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const result = await sync.run({
      rest: makeFakeRest(),
      keys: {
        dsKit: "DS_KEY",
        fmKit: "FM_KEY",
        metaKit: "META_KEY",
      },
      outputDir: outputDir,
      releaseNotesDir: releaseNotesDir,
      artifactsDir: artifactsDir,
      pluginJsonPath: pkgPath,
      manifestPath: manifestPath,
      phase: "registries",
    });

    // Verdict should be additive: metaKit gained a component.
    assert.equal(result.category, "additive");
    assert.equal(result.bumpedFrom, "1.0.0");
    assert.equal(result.bumpedTo, "1.0.1");

    // Both files must end up bumped to 1.0.1.
    const pkgAfter = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    assert.equal(pkgAfter.version, "1.0.1", "package.json#version bumped");

    const manifestAfter = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(
      manifestAfter.knowledge_version,
      "1.0.1",
      "paths-manifest.json#knowledge_version bumped together with package.json",
    );
    // Schema-format version must be untouched.
    assert.equal(manifestAfter.manifest_schema_version, "v1");
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("sync auto-bump — no manifestPath means no manifest write (backwards compat)", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-bump-"));
  try {
    const pkgPath = path.join(tmpdir, "package.json");
    const manifestPath = path.join(tmpdir, "paths-manifest.json");
    const outputDir = path.join(tmpdir, "components", "dist", "registries");

    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2) + "\n",
      "utf8",
    );
    // Manifest exists but is NOT passed via opts.manifestPath — must stay put.
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          manifest_schema_version: "v1",
          knowledge_version: "1.0.0",
          paths: {},
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    await sync.run({
      rest: makeFakeRest(),
      keys: { dsKit: "DS_KEY", fmKit: "FM_KEY", metaKit: "META_KEY" },
      outputDir: outputDir,
      releaseNotesDir: path.join(tmpdir, "release-notes"),
      artifactsDir: path.join(tmpdir, "tmp-artifacts"),
      pluginJsonPath: pkgPath,
      // manifestPath omitted on purpose
      phase: "registries",
    });

    const pkgAfter = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    assert.equal(pkgAfter.version, "1.0.1");

    const manifestAfter = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(
      manifestAfter.knowledge_version,
      "1.0.0",
      "manifest left untouched when --manifest-path is not passed",
    );
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("sync CLI parser — accepts --manifest-path and --categories-path", () => {
  const parsed = sync.parseArgs([
    "--phase",
    "registries",
    "--manifest-path",
    "paths-manifest.json",
    "--categories-path",
    "components/dist/categories.json",
  ]);
  assert.equal(parsed.phase, "registries");
  assert.equal(parsed.manifestPath, "paths-manifest.json");
  assert.equal(parsed.categoriesPath, "components/dist/categories.json");
});
