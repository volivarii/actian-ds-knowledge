"use strict";

// #552: a slug rename lands ADDITIVE, because the run records where the slug
// went before it classifies.
//
// The deadlock this proves is gone: the ledger used to be derived in a later
// step than the verdict, and a breaking verdict opens no PR, so the regenerated
// ledger was discarded and the identical rename was re-detected every night.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const sync = require(
  path.join(__dirname, "..", "scripts", "sync", "sync-from-figma.js"),
);

// One standalone component in dsKit, under the name the run should adopt.
function restRenaming(name, key) {
  return {
    getComponentSets: async () => ({ meta: { component_sets: [] } }),
    getComponents: async (fileKey) =>
      fileKey === "DS_KEY"
        ? {
            meta: {
              components: [
                {
                  key: key,
                  name: name,
                  node_id: "10:1",
                  description: "",
                  containing_frame: {},
                },
              ],
            },
          }
        : { meta: { components: [] } },
    getNodes: async () => ({ nodes: {} }),
    getFile: async () => ({ document: { children: [] } }),
    getStyles: async () => ({ meta: { styles: [] } }),
  };
}

function seedRepo(tmpdir, committedRegistry) {
  const outputDir = path.join(tmpdir, "components", "dist", "registries");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "dskit.json"),
    JSON.stringify(committedRegistry, null, 2) + "\n",
  );
  // The committed ledger, as main carries it. History is derived by comparing
  // the run's registries against THIS, so without it a rename has no recorded
  // predecessor and cannot be absorbed. That is correct and deliberate: the
  // ledger cannot resolve a rename that predates its own existence.
  const entries = {};
  Object.keys(committedRegistry.components).forEach(function (slug) {
    const c = committedRegistry.components[slug];
    entries[c.key || c.nodeId] = {
      slug: slug,
      nodeId: c.nodeId,
      previousSlugs: [],
    };
  });
  fs.writeFileSync(
    path.join(tmpdir, "components", "dist", "identity.json"),
    JSON.stringify({ schemaVersion: "1.0.0", entries: entries }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(tmpdir, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(tmpdir, "paths-manifest.json"),
    JSON.stringify(
      { manifest_schema_version: "v1", knowledge_version: "1.0.0", paths: {} },
      null,
      2,
    ) + "\n",
  );
  return outputDir;
}

async function runSync(tmpdir, outputDir, rest) {
  return sync.run({
    rest: rest,
    keys: { dsKit: "DS_KEY", fmKit: "FM_KEY", metaKit: "META_KEY" },
    outputDir: outputDir,
    releaseNotesDir: path.join(tmpdir, "release-notes"),
    artifactsDir: path.join(tmpdir, "tmp-artifacts"),
    pluginJsonPath: path.join(tmpdir, "package.json"),
    manifestPath: path.join(tmpdir, "paths-manifest.json"),
    phase: "registries",
  });
}

test("a slug rename is additive, and the ledger records where the slug went", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-rename-"));
  try {
    const outputDir = seedRepo(tmpdir, {
      library: "ds",
      fileKey: "DS_KEY",
      components: {
        "sticky-footer": {
          name: "Sticky footer",
          key: "K-STICKY",
          nodeId: "10:1",
        },
      },
    });

    const result = await runSync(
      tmpdir,
      outputDir,
      restRenaming("Action bar", "K-STICKY"),
    );

    assert.equal(
      result.category,
      "additive",
      "a rename whose old slug still resolves must not stall the night",
    );

    const ledger = JSON.parse(
      fs.readFileSync(
        path.join(tmpdir, "components", "dist", "identity.json"),
        "utf8",
      ),
    );
    const entry = ledger.entries["K-STICKY"];
    assert.ok(entry, "the ledger must carry the component's identity");
    assert.equal(entry.slug, "action-bar");
    assert.deepEqual(
      entry.previousSlugs,
      ["sticky-footer"],
      "the old slug must be recorded, which is what makes it still resolve",
    );
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("a removal alongside a rename still stalls the night", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-rename-rm-"));
  try {
    const outputDir = seedRepo(tmpdir, {
      library: "ds",
      fileKey: "DS_KEY",
      components: {
        "sticky-footer": {
          name: "Sticky footer",
          key: "K-STICKY",
          nodeId: "10:1",
        },
        "alert-inline": { name: "Alert-inline", key: "K-ALERT", nodeId: "10:2" },
      },
    });

    // Figma returns only the renamed component: the other one is gone.
    const result = await runSync(
      tmpdir,
      outputDir,
      restRenaming("Action bar", "K-STICKY"),
    );

    assert.equal(
      result.category,
      "breaking",
      "absorbing a rename must not launder a removal into an auto-merge",
    );
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});
