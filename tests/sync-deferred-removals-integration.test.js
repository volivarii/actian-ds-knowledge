"use strict";

// End to end: a deferred removal keeps the night moving, and an expired one
// stops it again. Drives the real `run()` against a stubbed REST, confined to a
// tmpdir (pluginDir AND outputDir AND the rest — outputDir alone does not
// confine a run; see sync-rename-absorption.test.js).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const sync = require(
  path.join(__dirname, "..", "scripts", "sync", "sync-from-figma.js"),
);

// Figma returns ONLY `button`, so `card-for-items` reads as removed.
const restWithoutCard = {
  getComponentSets: async () => ({ meta: { component_sets: [] } }),
  getComponents: async (fileKey) =>
    fileKey === "DS_KEY"
      ? {
          meta: {
            components: [
              {
                key: "K-BUTTON",
                name: "Button",
                node_id: "10:2",
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

function seedRepo(tmpdir, deferrals) {
  const outputDir = path.join(tmpdir, "components", "dist", "registries");
  fs.mkdirSync(outputDir, { recursive: true });
  const registry = {
    library: "ds",
    fileKey: "DS_KEY",
    components: {
      button: { name: "Button", key: "K-BUTTON", nodeId: "10:2" },
      "card-for-items": {
        name: "Card for items",
        key: "K-CARD",
        nodeId: "10:1",
      },
    },
  };
  fs.writeFileSync(
    path.join(outputDir, "dskit.json"),
    JSON.stringify(registry, null, 2) + "\n",
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
  // The committed ledger, as main carries it. A deferred component must keep its
  // entry AND its accumulated history: that history is what
  // clients/resolve-paths.js reads to resolve a slug a component was renamed
  // away from, and it is not derivable from current state.
  fs.mkdirSync(path.join(tmpdir, "components", "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpdir, "components", "dist", "identity.json"),
    JSON.stringify(
      {
        schemaVersion: "1.0.0",
        entries: {
          "K-BUTTON": { slug: "button", nodeId: "10:2", previousSlugs: [] },
          "K-CARD": {
            slug: "card-for-items",
            nodeId: "10:1",
            previousSlugs: ["old-card"],
          },
        },
      },
      null,
      2,
    ) + "\n",
  );
  if (deferrals) {
    fs.mkdirSync(path.join(tmpdir, "components", "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpdir, "components", "src", "sync-deferrals.json"),
      JSON.stringify({ deferrals: deferrals }, null, 2) + "\n",
    );
  }
  return outputDir;
}

async function runSync(tmpdir, outputDir) {
  return sync.run({
    rest: restWithoutCard,
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

const DEFERRAL = {
  kit: "dsKit",
  slug: "card-for-items",
  key: "K-CARD",
  reason: "Figma refactor incomplete: Card is an empty shell",
  issue: 526,
  review_by: "2099-01-01",
};

test("without a deferral the removal is breaking, which is the baseline this feature changes", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-defer-base-"));
  try {
    const outputDir = seedRepo(tmpdir, null);
    const result = await runSync(tmpdir, outputDir);
    assert.equal(result.category, "breaking");
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("a live deferral keeps the night moving, and the carried entry is marked", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-defer-live-"));
  try {
    const outputDir = seedRepo(tmpdir, [DEFERRAL]);
    const result = await runSync(tmpdir, outputDir);
    assert.notEqual(
      result.category,
      "breaking",
      "a deferred removal must not stall the night",
    );
    const written = JSON.parse(
      fs.readFileSync(path.join(outputDir, "dskit.json"), "utf8"),
    );
    const carried = written.components["card-for-items"];
    assert.ok(
      carried,
      "the deferred entry must survive in the written registry",
    );
    assert.equal(carried.deferral.issue, 526);
    assert.equal(carried.name, "Card for items", "carried verbatim");
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("an expired deferral stops working: the removal returns and the night breaks again", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-defer-exp-"));
  try {
    const expired = Object.assign({}, DEFERRAL, { review_by: "2026-01-01" });
    const outputDir = seedRepo(tmpdir, [expired]);
    const result = await runSync(tmpdir, outputDir);
    assert.equal(
      result.category,
      "breaking",
      "past review_by the deferral must stop applying",
    );
    const written = JSON.parse(
      fs.readFileSync(path.join(outputDir, "dskit.json"), "utf8"),
    );
    assert.equal(written.components["card-for-items"], undefined);
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("the release notes name every deferral, so it is recorded rather than hidden", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-defer-notes-"));
  try {
    const outputDir = seedRepo(tmpdir, [DEFERRAL]);
    const result = await runSync(tmpdir, outputDir);
    const notes = fs.readFileSync(result.releasePath, "utf8");
    assert.match(notes, /Deferred removals/i);
    assert.match(notes, /card-for-items/);
    assert.match(notes, /empty shell/, "the reason must travel with it");
    assert.match(notes, /526/, "and the issue it is parked on");
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("a deferred entry is counted, so componentCount does not go stale", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-defer-count-"));
  try {
    const outputDir = seedRepo(tmpdir, [DEFERRAL]);
    await runSync(tmpdir, outputDir);
    const written = JSON.parse(
      fs.readFileSync(path.join(outputDir, "dskit.json"), "utf8"),
    );
    assert.equal(
      written.componentCount,
      Object.keys(written.components).length,
      "componentCount must match what the file actually holds",
    );
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("a deferred component keeps its identity ledger entry and its rename history", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-defer-ledger-"));
  try {
    const outputDir = seedRepo(tmpdir, [DEFERRAL]);
    await runSync(tmpdir, outputDir);
    const ledger = JSON.parse(
      fs.readFileSync(
        path.join(tmpdir, "components", "dist", "identity.json"),
        "utf8",
      ),
    );
    const entry = ledger.entries["K-CARD"];
    assert.ok(entry, "a deferred component must not drop out of the ledger");
    assert.deepEqual(
      entry.previousSlugs,
      ["old-card"],
      "and its history must survive: it is not derivable from current state",
    );
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

// A deferral that is dead config produces no removal to break the night, so
// without this the verdict can be `unchanged`: no PR, no tracking issue, and
// release-notes/ is gitignored, so the 🚨 line is discarded with the runner.
// That is a warning inside a green run, which this feature's own rationale
// cites plugin #294 to reject.
test("a broken deferral forces the night breaking, so it cannot evaporate", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-defer-dead-"));
  try {
    // `button` is NOT being removed, so this deferral has no subject.
    const dead = Object.assign({}, DEFERRAL, {
      slug: "button",
      key: "K-BUTTON",
    });
    // and card-for-items is deferred properly, so nothing else breaks the night
    const outputDir = seedRepo(tmpdir, [DEFERRAL, dead]);
    const result = await runSync(tmpdir, outputDir);
    assert.equal(
      result.category,
      "breaking",
      "dead config must reach a human, not be discarded with the runner",
    );
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});
