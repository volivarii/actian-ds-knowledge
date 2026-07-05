// tests/sync-anatomy.test.js
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var {
  syncAnatomy,
  isIconComponent,
  pickDefaultVariant,
  keyToSlugMap,
  mergeComponentIdToKey,
} = require("../scripts/sync/sync-anatomy");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "anat-"));
}

function writeJsonReal(p, o) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(o));
}

test("isIconComponent flags only category=Icons", function () {
  assert.equal(isIconComponent({ category: "Icons" }), true);
  assert.equal(isIconComponent({ category: "Action" }), false);
  assert.equal(isIconComponent(null), false);
});

test("pickDefaultVariant returns the first COMPONENT child of a set", function () {
  var set = {
    type: "COMPONENT_SET",
    children: [
      { type: "COMPONENT", name: "Type=Primary, State=Default" },
      { type: "COMPONENT", name: "Type=Secondary, State=Default" },
    ],
  };
  var picked = pickDefaultVariant(set);
  assert.equal(picked.node.name, "Type=Primary, State=Default");
  assert.equal(picked.variant, "Type=Primary, State=Default");
});

test("pickDefaultVariant passes through a non-set node unchanged", function () {
  var node = { type: "COMPONENT", name: "Solo" };
  var picked = pickDefaultVariant(node);
  assert.equal(picked.node, node);
  assert.equal(picked.variant, null);
});

test("syncAnatomy skips icons + normalizes the default variant of a set", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  // a stale icon file from a pre-v2 sync — must be cleaned up
  fs.mkdirSync(anatomyDir, { recursive: true });
  writeJsonReal(path.join(anatomyDir, "add.json"), {
    slug: "add",
    stale: true,
  });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: {
        button: { nodeId: "1:1", category: "Action", importMethod: "set" },
        add: { nodeId: "2:2", category: "Icons", importMethod: "single" },
      },
    }),
  );
  var fakeRest = {
    getNodes: function () {
      return Promise.resolve({
        nodes: {
          "1:1": {
            document: {
              type: "COMPONENT_SET",
              name: "Button",
              children: [
                {
                  type: "COMPONENT",
                  name: "Type=Primary, State=Default",
                  layoutMode: "HORIZONTAL",
                  itemSpacing: 8,
                  children: [{ type: "TEXT", name: "Label", characters: "Go" }],
                },
                { type: "COMPONENT", name: "Type=Secondary, State=Default" },
              ],
            },
          },
        },
      });
    },
  };
  var written = await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: writeJsonReal,
      syncedAt: "2026-06-11",
    },
    "dsKit",
  );
  assert.equal(written.count, 1); // button only (icon skipped)
  // icon was skipped AND its stale file cleaned
  assert.equal(fs.existsSync(path.join(anatomyDir, "add.json")), false);
  // an icon-transition prune is a real deletion — review-required + visible
  // (pins the intended escalation for real recategorizations, e.g. input→icon)
  assert.equal(written.verdict.category, "breaking");
  assert.match(
    written.verdict.changelog,
    /Deleted 1 stale anatomy file\(s\): add/,
  );
  // button anatomy is the DEFAULT VARIANT (a real row), not the variant grid
  var btn = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "button.json"), "utf8"),
  );
  assert.equal(btn.root.layout.axis, "row"); // the variant's auto-layout, not a NONE grid
  assert.equal(btn.source.variant, "Type=Primary, State=Default");
});

test("an empty Figma response does NOT wipe existing anatomy files (no data loss)", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.mkdirSync(anatomyDir, { recursive: true });
  // pre-existing good data from a prior sync
  writeJsonReal(path.join(anatomyDir, "button.json"), { slug: "button" });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: { button: { nodeId: "1:1", category: "Action" } },
    }),
  );
  // transient outage: getNodes returns nothing
  var fakeRest = {
    getNodes: function () {
      return Promise.resolve({ nodes: {} });
    },
  };
  var written = await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: writeJsonReal,
      syncedAt: "2026-06-11",
    },
    "dsKit",
  );
  assert.equal(written.count, 0);
  // the existing file must survive — prune only runs when we wrote something
  assert.equal(fs.existsSync(path.join(anatomyDir, "button.json")), true);
});

test("syncAnatomy writes per-slug files + bundle from a fake rest", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      library: "ds",
      fileKey: "F",
      components: { button: { name: "Button", key: "k", nodeId: "1:1" } },
    }),
  );

  var fakeRest = {
    getNodes: function (fileKey, ids) {
      return Promise.resolve({
        nodes: {
          "1:1": {
            document: {
              type: "COMPONENT",
              name: "Button",
              layoutMode: "HORIZONTAL",
              itemSpacing: 8,
              children: [{ type: "TEXT", name: "Label", characters: "Click" }],
            },
          },
        },
      });
    },
    // no getLocalVariables → tokenRefs degrade to []
  };

  var written = await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: function (p, o) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(o));
      },
      syncedAt: "2026-06-11",
    },
    "dsKit",
  );

  assert.equal(written.kind, "anatomy");
  assert.equal(written.count, 1);
  // phase contract: aggregateVerdict/buildChangelog read fileLabel + verdict
  assert.equal(written.fileLabel, "anatomy:dsKit");
  assert.equal(written.verdict.category, "additive");
  var file = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "button.json"), "utf8"),
  );
  assert.equal(file._schema_version, 1);
  assert.equal(file.slug, "button");
  assert.equal(file.kit, "dskit");
  assert.equal(file.root.layout.axis, "row");
  var bundle = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "..", "anatomy.bundle.json"), "utf8"),
  );
  // bundle is enveloped under `components` (not a bare slug map)
  assert.ok(bundle.components.button);
  assert.equal(bundle._schema_version, 1);
});

test("keyToSlugMap maps each component key to its slug, skipping keyless entries", function () {
  var registry = {
    components: {
      button: { key: "K_BTN", nodeId: "1:1" },
      add: { key: "K_ADD", nodeId: "2:2", category: "Icons" },
      ghost: { nodeId: "3:3" }, // no key — skipped
    },
  };
  assert.deepEqual(keyToSlugMap(registry), { K_BTN: "button", K_ADD: "add" });
});

test("keyToSlugMap tolerates a missing or empty registry", function () {
  assert.deepEqual(keyToSlugMap(null), {});
  assert.deepEqual(keyToSlugMap({}), {});
  assert.deepEqual(keyToSlugMap({ components: {} }), {});
});

test("mergeComponentIdToKey merges components dicts across node payloads", function () {
  var nodes = {
    "1:1": {
      components: { C1: { key: "KA", name: "A" }, C2: { key: "KB" } },
    },
    "2:2": { components: { C3: { key: "KC" } } },
    "3:3": {}, // no components — skipped
  };
  assert.deepEqual(mergeComponentIdToKey(nodes), {
    C1: "KA",
    C2: "KB",
    C3: "KC",
  });
});

test("mergeComponentIdToKey is deterministic last-writer-wins on a duplicate componentId", function () {
  // Object.keys preserves insertion order for non-array-index string keys
  // ("1:1", "2:2"), so the later payload deterministically overwrites.
  var nodes = {
    "1:1": { components: { C1: { key: "FIRST" } } },
    "2:2": { components: { C1: { key: "SECOND" } } },
  };
  assert.equal(mergeComponentIdToKey(nodes).C1, "SECOND");
});

test("mergeComponentIdToKey tolerates empty or missing input", function () {
  assert.deepEqual(mergeComponentIdToKey(null), {});
  assert.deepEqual(mergeComponentIdToKey({}), {});
});

test("syncAnatomy resolves a nested icon instance via the key path (node id absent from nodeIdToSlug)", function () {
  return (async function () {
    var dir = tmpDir();
    var registriesDir = path.join(dir, "registries");
    var anatomyDir = path.join(dir, "anatomy");
    fs.mkdirSync(registriesDir, { recursive: true });
    // button is a structural set; add is a curated icon. The icon INSTANCE inside
    // button references componentId "6001:1" (swap-default node space), which is
    // NOT add's registry nodeId ("2:2") — so the node-id path misses and only the
    // key path (via the getNodes components dict) can resolve it.
    fs.writeFileSync(
      path.join(registriesDir, "dskit.json"),
      JSON.stringify({
        components: {
          button: {
            nodeId: "1:1",
            key: "K_BTN",
            category: "Action",
            importMethod: "set",
          },
          add: {
            nodeId: "2:2",
            key: "K_ADD",
            category: "Icons",
            importMethod: "single",
          },
        },
      }),
    );
    var fakeRest = {
      getNodes: function () {
        return Promise.resolve({
          nodes: {
            "1:1": {
              // the components dict Figma returns alongside the document
              components: { "6001:1": { key: "K_ADD", name: "add" } },
              document: {
                type: "COMPONENT_SET",
                name: "Button",
                children: [
                  {
                    type: "COMPONENT",
                    name: "Type=Primary",
                    layoutMode: "HORIZONTAL",
                    itemSpacing: 8,
                    children: [
                      {
                        type: "INSTANCE",
                        name: "Leading icon",
                        componentId: "6001:1",
                      },
                      { type: "TEXT", name: "Label", characters: "Go" },
                    ],
                  },
                ],
              },
            },
          },
        });
      },
    };
    var written = await syncAnatomy(
      {
        rest: fakeRest,
        registriesDir: registriesDir,
        anatomyDir: anatomyDir,
        keys: { dsKit: "F" },
        writeJson: writeJsonReal,
        syncedAt: "2026-06-14",
      },
      "dsKit",
    );
    assert.equal(written.count, 1); // button (icon skipped from fetch)
    var btn = JSON.parse(
      fs.readFileSync(path.join(anatomyDir, "button.json"), "utf8"),
    );
    // the nested icon instance resolved via the KEY path, not node id
    var icon = btn.root.children[0];
    assert.equal(icon.kind, "instance");
    assert.equal(icon.slug, "add");
    assert.equal(icon.unresolved, undefined);
    // variant + instance + label all normalized → ratio 1.0 (was 0.67 before the fix)
    assert.equal(btn.quality.ratio, 1);
  })();
});

test("syncAnatomy captures per-variant appearance for a COMPONENT_SET", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: { banner: { nodeId: "1:1", category: "Feedback" } },
    }),
  );
  function variantComp(name, color) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      fills: [{ type: "SOLID", color: color }],
      children: [],
    };
  }
  var setDoc = {
    type: "COMPONENT_SET",
    name: "Banner",
    children: [
      variantComp("Type=Default", { r: 1, g: 1, b: 1, a: 1 }),
      variantComp("Type=Danger", { r: 0.863, g: 0.208, b: 0.078, a: 1 }),
    ],
  };
  var fakeRest = {
    getNodes: function () {
      return Promise.resolve({ nodes: { "1:1": { document: setDoc } } });
    },
  };
  var written = {};
  await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: function (p, o) {
        written[path.basename(p)] = o;
      },
      syncedAt: "2026-07-03",
    },
    "dsKit",
  );
  var banner = written["banner.json"];
  assert.deepEqual(banner.variantDefaults, { Type: "Default" });
  assert.deepEqual(banner.root.appearance.variants, [
    { prop: "Type", values: ["Danger"], background: "#dc3514" },
  ]);
});

// --- prune guard + failed-slug visibility ---
// A transient Figma miss (payload absent) or a per-slug normalization failure
// must never let pruneStaleAnatomy delete the slug's existing file, and must be
// visible in the changelog the sync PR renders. Deleting a file (slug genuinely
// gone from the registry) is consumer-visible → escalates the phase to breaking.

function wave1ComponentDoc(name) {
  return {
    type: "COMPONENT",
    name: name,
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    children: [{ type: "TEXT", name: "Label", characters: "Go" }],
  };
}

test("a slug with a missing node payload is reported failed and its file survives the prune", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.mkdirSync(anatomyDir, { recursive: true });
  // pre-existing good data from a prior sync
  writeJsonReal(path.join(anatomyDir, "card.json"), {
    slug: "card",
    prior: true,
  });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: {
        button: { nodeId: "1:1", category: "Action" },
        card: { nodeId: "2:2", category: "Data Display" },
      },
    }),
  );
  var fakeRest = {
    getNodes: function () {
      // transient hiccup: card's subtree is missing from the response
      return Promise.resolve({
        nodes: { "1:1": { document: wave1ComponentDoc("Button") } },
      });
    },
  };
  var written = await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: writeJsonReal,
      syncedAt: "2026-07-05",
    },
    "dsKit",
  );
  assert.equal(written.count, 1);
  // the miss is RECORDED, not silent
  assert.ok(written.failed, "missing payload must be recorded in failed");
  assert.equal(written.failed.length, 1);
  assert.equal(written.failed[0].slug, "card");
  // and visible in the changelog the PR body renders
  assert.match(written.verdict.changelog, /card/);
  assert.match(written.verdict.changelog, /preserved/i);
  // the existing file SURVIVES the prune (was: silently deleted)
  assert.equal(fs.existsSync(path.join(anatomyDir, "card.json")), true);
  // a recorded failure with the file preserved is not a deletion — stays additive
  assert.equal(written.verdict.category, "additive");
});

test("a slug whose per-slug write throws keeps its existing file and is reported failed", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.mkdirSync(anatomyDir, { recursive: true });
  writeJsonReal(path.join(anatomyDir, "card.json"), {
    slug: "card",
    prior: true,
  });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: {
        button: { nodeId: "1:1", category: "Action" },
        card: { nodeId: "2:2", category: "Data Display" },
      },
    }),
  );
  var fakeRest = {
    getNodes: function () {
      return Promise.resolve({
        nodes: {
          "1:1": { document: wave1ComponentDoc("Button") },
          "2:2": { document: wave1ComponentDoc("Card") },
        },
      });
    },
  };
  var failingWriteJson = function (p, o) {
    if (path.basename(p) === "card.json") throw new Error("disk full");
    writeJsonReal(p, o);
  };
  var written = await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: failingWriteJson,
      syncedAt: "2026-07-05",
    },
    "dsKit",
  );
  assert.equal(written.count, 1);
  assert.ok(written.failed);
  assert.equal(written.failed[0].slug, "card");
  assert.match(written.verdict.changelog, /card/);
  // prior card.json untouched by the prune
  assert.equal(fs.existsSync(path.join(anatomyDir, "card.json")), true);
});

test("a full transient outage preserves the bundle from disk (no bundle wipe)", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.mkdirSync(anatomyDir, { recursive: true });
  // prior sync state: two good per-slug files
  writeJsonReal(path.join(anatomyDir, "button.json"), {
    slug: "button",
    prior: true,
  });
  writeJsonReal(path.join(anatomyDir, "card.json"), {
    slug: "card",
    prior: true,
  });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: {
        button: { nodeId: "1:1", category: "Action" },
        card: { nodeId: "2:2", category: "Data Display" },
      },
    }),
  );
  var fakeRest = {
    getNodes: function () {
      return Promise.resolve({ nodes: {} }); // total outage
    },
  };
  var written = await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: writeJsonReal,
      syncedAt: "2026-07-05",
    },
    "dsKit",
  );
  assert.equal(written.count, 0);
  assert.equal(written.failed.length, 2);
  // the bundle is NOT wiped — failed slugs are seeded from the existing dist
  var bundle = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "..", "anatomy.bundle.json"), "utf8"),
  );
  assert.equal(bundle.components.button.prior, true);
  assert.equal(bundle.components.card.prior, true);
});

test("a partially-failed sync keeps the failed slug's prior entry in the bundle", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.mkdirSync(anatomyDir, { recursive: true });
  writeJsonReal(path.join(anatomyDir, "card.json"), {
    slug: "card",
    prior: true,
  });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: {
        button: { nodeId: "1:1", category: "Action" },
        card: { nodeId: "2:2", category: "Data Display" },
      },
    }),
  );
  var fakeRest = {
    getNodes: function () {
      return Promise.resolve({
        nodes: { "1:1": { document: wave1ComponentDoc("Button") } },
      });
    },
  };
  await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: writeJsonReal,
      syncedAt: "2026-07-05",
    },
    "dsKit",
  );
  var bundle = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "..", "anatomy.bundle.json"), "utf8"),
  );
  // fresh slug is fresh, failed slug is the preserved prior entry
  assert.equal(bundle.components.button.slug, "button");
  assert.equal(bundle.components.button.prior, undefined);
  assert.equal(bundle.components.card.prior, true);
});

test("pruning a genuinely-removed slug escalates the phase verdict to breaking", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.mkdirSync(anatomyDir, { recursive: true });
  // a slug that no longer exists in the registry — its file is legitimately stale
  writeJsonReal(path.join(anatomyDir, "gone.json"), { slug: "gone" });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: { button: { nodeId: "1:1", category: "Action" } },
    }),
  );
  var fakeRest = {
    getNodes: function () {
      return Promise.resolve({
        nodes: { "1:1": { document: wave1ComponentDoc("Button") } },
      });
    },
  };
  var written = await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: writeJsonReal,
      syncedAt: "2026-07-05",
    },
    "dsKit",
  );
  assert.equal(fs.existsSync(path.join(anatomyDir, "gone.json")), false);
  // deletion is consumer-visible → the phase must demand review
  assert.equal(written.verdict.category, "breaking");
  assert.match(written.verdict.changelog, /gone/);
  assert.match(written.verdict.changelog, /deleted/i);
});

test("syncAnatomy resolves token refs when getLocalVariables is available", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: { button: { nodeId: "1:1" } },
    }),
  );
  var fakeRest = {
    getNodes: function () {
      return Promise.resolve({
        nodes: {
          "1:1": {
            document: {
              type: "COMPONENT",
              name: "Button",
              layoutMode: "HORIZONTAL",
              boundVariables: { itemSpacing: { id: "V1" } },
              itemSpacing: 8,
              children: [],
            },
          },
        },
      });
    },
    getLocalVariables: function () {
      return Promise.resolve({
        meta: { variables: { V1: { name: "spacing/100" } } },
      });
    },
  };
  var written = await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: function (p, o) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(o));
      },
      syncedAt: "2026-06-11",
    },
    "dsKit",
  );
  assert.equal(written.count, 1);
  var file = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "button.json"), "utf8"),
  );
  assert.equal(file.root.layout.gap, "--spacing-100");
});
