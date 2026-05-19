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

test("sync auto-bump — regenerates MAP.md when manifest bumped (3-file lockstep)", async () => {
  // 2026-05-19 root-cause fix: every breaking/additive sync used to leave
  // MAP.md drifted from paths-manifest.json#knowledge_version, requiring a
  // contributor to hand-regenerate MAP and push before validate-manifest CI
  // could pass. The orchestrator now regenerates MAP.md in lockstep with
  // the manifest bump.
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-bump-"));
  try {
    const pkgPath = path.join(tmpdir, "package.json");
    const manifestPath = path.join(tmpdir, "paths-manifest.json");
    const mapPath = path.join(tmpdir, "MAP.md");
    const scriptsDir = path.join(tmpdir, "scripts");
    const generateMapPath = path.join(scriptsDir, "generate-map.js");
    const outputDir = path.join(tmpdir, "components", "dist", "registries");

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
    fs.writeFileSync(mapPath, "Knowledge version: **1.0.0**.\n", "utf8");
    // Synthetic generate-map.js sibling — the orchestrator looks for it
    // alongside paths-manifest.json. Emits a MAP that echoes the manifest version.
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      generateMapPath,
      "module.exports.generateMap = function (m) { return 'Knowledge version: **' + m.knowledge_version + '**.\\n'; };\n",
      "utf8",
    );

    await sync.run({
      rest: makeFakeRest(),
      keys: { dsKit: "DS_KEY", fmKit: "FM_KEY", metaKit: "META_KEY" },
      outputDir: outputDir,
      releaseNotesDir: path.join(tmpdir, "release-notes"),
      artifactsDir: path.join(tmpdir, "tmp-artifacts"),
      pluginJsonPath: pkgPath,
      manifestPath: manifestPath,
      phase: "registries",
    });

    const mapAfter = fs.readFileSync(mapPath, "utf8");
    assert.match(
      mapAfter,
      /Knowledge version: \*\*1\.0\.1\*\*/,
      "MAP.md regenerated to match bumped knowledge_version",
    );
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("sync auto-bump — no MAP.md regen when --manifest-path is not passed (backwards compat)", async () => {
  // The MAP regen step gates on the same condition as the manifest bump
  // (opts.manifestPath was supplied AND the file exists), so legacy callers
  // that don't pass --manifest-path stay completely unaffected.
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-bump-"));
  try {
    const pkgPath = path.join(tmpdir, "package.json");
    const mapPath = path.join(tmpdir, "MAP.md");
    const originalMap = "Knowledge version: **1.0.0**.\n";
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(mapPath, originalMap, "utf8");

    await sync.run({
      rest: makeFakeRest(),
      keys: { dsKit: "DS_KEY", fmKit: "FM_KEY", metaKit: "META_KEY" },
      outputDir: path.join(tmpdir, "components", "dist", "registries"),
      releaseNotesDir: path.join(tmpdir, "release-notes"),
      artifactsDir: path.join(tmpdir, "tmp-artifacts"),
      pluginJsonPath: pkgPath,
      phase: "registries",
      // manifestPath omitted on purpose
    });

    const mapAfter = fs.readFileSync(mapPath, "utf8");
    assert.equal(
      mapAfter,
      originalMap,
      "MAP.md untouched when no manifestPath",
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
