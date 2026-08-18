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
    // 🚨 pluginDir MUST be set. It defaults to the repo root, and the anatomy
    // phase derives its own directory from it and PRUNES what the run did not
    // write. Omitting it here deleted 179 real anatomy files during
    // development, restored from git. outputDir alone does not confine a run.
    pluginDir: tmpdir,
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

test("an unreadable committed registry abandons absorption instead of erasing history", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-corrupt-"));
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
    // A kit whose fetch fails falls back to its committed file, and that file is
    // truncated from an earlier interrupted write. Rewriting the ledger from
    // what is left would drop every metaKit identity AND its previousSlugs,
    // which is history no later run can recover.
    fs.writeFileSync(path.join(outputDir, "metakit.json"), '{"components": {');
    const ledgerBefore = fs.readFileSync(
      path.join(tmpdir, "components", "dist", "identity.json"),
      "utf8",
    );

    const rest = restRenaming("Action bar", "K-STICKY");
    rest.getComponents = async (fileKey) => {
      if (fileKey === "META_KEY") throw new Error("figma 500");
      return fileKey === "DS_KEY"
        ? {
            meta: {
              components: [
                {
                  key: "K-STICKY",
                  name: "Action bar",
                  node_id: "10:1",
                  description: "",
                  containing_frame: {},
                },
              ],
            },
          }
        : { meta: { components: [] } };
    };

    const result = await runSync(tmpdir, outputDir, rest);

    assert.equal(
      fs.readFileSync(
        path.join(tmpdir, "components", "dist", "identity.json"),
        "utf8",
      ),
      ledgerBefore,
      "the ledger must not be rewritten from a partial registry set",
    );
    // 🪤 NOT an assertion about the rename verdict. The failed metaKit fetch
    // pushes an error, and aggregateVerdict returns "error" before any registry
    // verdict is consulted, so a check for "not additive" here would pass
    // whether or not absorption had been wrongly applied. The meaningful
    // assertion is the untouched ledger above; this one only pins the shape of
    // the run so a future change to that path is visible.
    assert.equal(result.category, "error");
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("a ledger that cannot be written degrades the rename, it does not discard the night", async (t) => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-ledger-fail-"));
  try {
    const outputDir = seedRepo(tmpdir, {
      library: "ds",
      fileKey: "DS_KEY",
      components: { "some-card": { name: "Some card", key: "K-CARD", nodeId: "9:1" } },
    });
    // The ledger is valid and readable; its DIRECTORY is read-only, so the
    // rebuild parses fine and then fails at writeFileSync. That is the path the
    // degradation exists for, and it is distinct from an unreadable ledger,
    // which is handled before any write is attempted.
    const ledgerPath = path.join(tmpdir, "components", "dist", "identity.json");
    fs.chmodSync(ledgerPath, 0o444);
    // 🪤 chmod does not stop root. In a root container this test would assert
    // "additive" on a run where the ledger wrote fine and nothing degraded,
    // which is a guard that cannot fail. Prove the setup actually bites first.
    let readOnly = false;
    try {
      fs.appendFileSync(ledgerPath, "");
    } catch (e) {
      readOnly = true;
    }
    if (!readOnly) {
      t.skip("running as root: a read-only file cannot be simulated");
      return;
    }

    // An ordinary additive night: one component gains a sibling.
    const rest = restRenaming("Some card", "K-CARD");
    rest.getComponents = async (fileKey) =>
      fileKey === "DS_KEY"
        ? {
            meta: {
              components: [
                { key: "K-CARD", name: "Some card", node_id: "9:1", description: "", containing_frame: {} },
                { key: "K-NEW", name: "Brand new", node_id: "9:2", description: "", containing_frame: {} },
              ],
            },
          }
        : { meta: { components: [] } };

    const result = await runSync(tmpdir, outputDir, rest);

    assert.notEqual(
      result.category,
      "error",
      "a ledger write failure must not throw away an otherwise additive night",
    );
    assert.equal(result.category, "additive");
  } finally {
    try {
      fs.chmodSync(
        path.join(tmpdir, "components", "dist", "identity.json"),
        0o644,
      );
    } catch (e) {
      void e;
    }
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

// ⚠️ A `--phase all` test belongs here and is NOT here, deliberately.
//
// It was written, and it passed: with one more REST stub (`getImages`) the full
// pipeline completes and a rename lands additive through anatomy. But running it
// WROTE INTO THE REAL REPOSITORY. `pluginDir` confines most phases; the graphics
// derive does not honour it, because scripts/graphics/derive-graphics-svg.js
// hardcodes `ROOT = path.resolve(__dirname, "..", "..")`. Restoring the file it
// touches from a test would race sibling test files, since `node --test` runs
// them in parallel.
//
// The cost of finding that out was real: an earlier version of the test, which
// also omitted `pluginDir`, let the anatomy phase prune 179 committed anatomy
// files. Restored from git, but it would have been committed had the suite not
// been checked against `git status`.
//
// So the orchestrator's handoff of absorbedRenames to the anatomy phase stays
// UNCOVERED. Both ends around it are tested: consumerVisibleDeletions here, and
// syncAnatomy reading opts.absorbedRenames in tests/sync-anatomy.test.js.
//
// 🪤 The trap this sits in is the third recorded occurrence: `--phase all`
// stalling against real Figma pushed two prior sessions to `--phase registries`,
// which returns additive and never runs the phase where a rename's deletion
// surfaces. The workaround for the stall is what creates the blind spot. A test
// that exercises the phase most likely to pass is not a test of the change.

test("a rename whose old slug is still named in authored source stays breaking", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-blocked-"));
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
    // The renderer still has `case "sticky-footer"`. That must be renamed by a
    // human: tolerating it would ship a renderer that cannot draw the new slug.
    // Absorbing the rename here would open an auto-merge PR whose required
    // checks can never go green, which is worse than staying breaking.
    const mapPath = path.join(
      tmpdir,
      "components/render/renderer/html-renderers/ds-html-map.js",
    );
    fs.mkdirSync(path.dirname(mapPath), { recursive: true });
    fs.writeFileSync(mapPath, 'switch (s) { case "sticky-footer": {} }');

    const result = await runSync(
      tmpdir,
      outputDir,
      restRenaming("Action bar", "K-STICKY"),
    );

    assert.equal(
      result.category,
      "breaking",
      "authored source still names the old slug, so the rename is not absorbable",
    );

    // The ledger is still written: recording where the slug went is true and
    // useful regardless of whether the verdict can absorb it yet.
    const ledger = JSON.parse(
      fs.readFileSync(
        path.join(tmpdir, "components", "dist", "identity.json"),
        "utf8",
      ),
    );
    assert.deepEqual(ledger.entries["K-STICKY"].previousSlugs, [
      "sticky-footer",
    ]);
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});
