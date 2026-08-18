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
  mergeComponentIdToSetId,
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

test("mergeComponentIdToSetId merges componentSetId across node payloads", function () {
  var nodes = {
    a: {
      components: {
        "99:2": { key: "kX", componentSetId: "20:0" },
        "10:0": { key: "kY" }, // no componentSetId, skipped
      },
    },
    b: { components: { "99:3": { componentSetId: "30:0" } } },
    c: {}, // no components, skipped
  };
  assert.deepEqual(mergeComponentIdToSetId(nodes), {
    "99:2": "20:0",
    "99:3": "30:0",
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

test("syncAnatomy resolves a nested composite via the componentSetId bridge, incl. the per-variant (vctx) path", function () {
  return (async function () {
    var dir = tmpDir();
    var registriesDir = path.join(dir, "registries");
    var anatomyDir = path.join(dir, "anatomy");
    fs.mkdirSync(registriesDir, { recursive: true });
    // card is a structural set. icon-a / icon-b are the nested composite targets:
    // the nested INSTANCEs (componentIds "aa"/"bb") are variant nodes whose set ids
    // ("2:2"/"3:3") are icon-a/icon-b's registry nodeIds. Their componentIds are NOT
    // registry nodeIds (Tier 1 misses) and their components-dict entries carry no key
    // (Tier 2 misses), so only the Tier-3 componentSetId bridge can resolve them.
    fs.writeFileSync(
      path.join(registriesDir, "dskit.json"),
      JSON.stringify({
        components: {
          card: {
            nodeId: "1:1",
            key: "K_CARD",
            category: "Data Display",
            importMethod: "set",
          },
          "icon-a": {
            nodeId: "2:2",
            key: "K_A",
            category: "Icons",
            importMethod: "single",
          },
          "icon-b": {
            nodeId: "3:3",
            key: "K_B",
            category: "Icons",
            importMethod: "single",
          },
        },
      }),
    );
    function variant(name, cid) {
      return {
        type: "COMPONENT",
        name: name,
        layoutMode: "HORIZONTAL",
        itemSpacing: 8,
        children: [{ type: "INSTANCE", name: "glyph", componentId: cid }],
      };
    }
    var fakeRest = {
      getNodes: function () {
        return Promise.resolve({
          nodes: {
            "1:1": {
              components: {
                aa: { componentSetId: "2:2" },
                bb: { componentSetId: "3:3" },
              },
              document: {
                type: "COMPONENT_SET",
                name: "Card",
                children: [
                  variant("Type=Default", "aa"),
                  variant("Type=Alt", "bb"),
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
    assert.equal(written.count, 1); // card (icons skipped from fetch)
    var card = JSON.parse(
      fs.readFileSync(path.join(anatomyDir, "card.json"), "utf8"),
    );
    var glyph = card.root.children[0];
    assert.equal(glyph.kind, "instance");
    // Wiring: the default variant's nested composite resolved via Tier 3 through
    // the full sync path (mergeComponentIdToSetId -> buildAnatomyFile -> normalizeNode).
    assert.equal(glyph.slug, "icon-a");
    // vctx: the Type=Alt variant's nested composite resolved via Tier 3 inside the
    // isolated-variant context, captured as a per-variant slug swap.
    assert.deepEqual(glyph.appearance.variants, [
      { prop: "Type", values: ["Alt"], slug: "icon-b" },
    ]);
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

test("a second identical sync writes nothing and reports unchanged (no synced_at churn)", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
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
  var writes = [];
  var countingWrite = function (p, o) {
    writes.push(path.basename(p));
    writeJsonReal(p, o);
  };
  var optsFor = function (syncedAt) {
    return {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: countingWrite,
      syncedAt: syncedAt,
    };
  };
  var r1 = await syncAnatomy(optsFor("2026-07-05T01:00:00Z"), "dsKit");
  assert.equal(r1.verdict.category, "additive");
  assert.ok(writes.length >= 2); // button.json + bundle
  var syncedAt1 = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "button.json"), "utf8"),
  ).synced_at;

  writes.length = 0;
  // Next night: identical Figma data, NEW syncedAt stamp.
  var r2 = await syncAnatomy(optsFor("2026-07-06T01:00:00Z"), "dsKit");
  assert.deepEqual(writes, [], "no-op night must write zero files");
  assert.equal(r2.verdict.category, "unchanged");
  assert.ok(!r2.wrote, "no-op night must not flag wrote");
  var syncedAt2 = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "button.json"), "utf8"),
  ).synced_at;
  // synced_at now means "last content change", not "last run".
  assert.equal(syncedAt2, syncedAt1);
});

test("bundle components are emitted in sorted slug order", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  // registry key order deliberately NOT sorted (pre-migration on-disk state)
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: {
        zeta: { nodeId: "1:1", category: "Action" },
        alpha: { nodeId: "2:2", category: "Action" },
      },
    }),
  );
  var fakeRest = {
    getNodes: function () {
      return Promise.resolve({
        nodes: {
          "1:1": { document: wave1ComponentDoc("Zeta") },
          "2:2": { document: wave1ComponentDoc("Alpha") },
        },
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
  assert.deepEqual(Object.keys(bundle.components), ["alpha", "zeta"]);
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
  // Layout spacing is captured as a VALUE; a typed gapToken rides only from the
  // length-gated P2 join (lengthNameById), NOT from raw REST getLocalVariables
  // names (which are un-typed) — the same reason appearance colors use the
  // gated colorNameById, not the REST varNameById. So no bare name in gap.
  assert.equal(file.root.layout.gap, "8px");
  assert.equal(file.root.layout.gapToken, undefined);
});

test("syncAnatomy feeds P2 token-name maps into appearance capture (opts.tokenNameMaps)", async function () {
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
    // No getLocalVariables: the tier-gated REST path stays dead; names come
    // from the committed export via the token-names maps.
    getNodes: function () {
      return Promise.resolve({
        nodes: {
          "1:1": {
            document: {
              type: "COMPONENT",
              name: "Button",
              layoutMode: "HORIZONTAL",
              itemSpacing: 8,
              fills: [
                {
                  type: "SOLID",
                  color: { r: 0.059, g: 0.373, b: 0.863, a: 1 },
                },
              ],
              boundVariables: {
                fills: [{ type: "VARIABLE_ALIAS", id: "VariableID:5:5" }],
                itemSpacing: { id: "VariableID:5:6" },
              },
              children: [],
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
      writeJson: function (p, o) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(o));
      },
      syncedAt: "2026-07-06",
      tokenNameMaps: {
        varNameById: { "VariableID:5:6": "--zen-spacing-xs" },
        colorNameById: { "VariableID:5:5": "--zen-color-bg-emphasis" },
        lengthNameById: { "VariableID:5:6": "--zen-spacing-xs" },
      },
    },
    "dsKit",
  );
  assert.equal(written.count, 1);
  var file = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "button.json"), "utf8"),
  );
  assert.equal(file.root.appearance.backgroundToken, "--zen-color-bg-emphasis");
  // Layout spacing: VALUE with the length-gated token beside it (never a bare
  // name in gap). The token rides from lengthNameById, like appearance colors
  // ride from colorNameById.
  assert.equal(file.root.layout.gap, "8px");
  assert.equal(file.root.layout.gapToken, "--zen-spacing-xs");
});

// ---------- #552: a rename's deleted anatomy file is not a removal ----------
//
// A slug rename deletes components/dist/anatomy/<oldSlug>.json and writes
// <newSlug>.json. The old file's disappearance is not consumer-visible loss:
// the identity ledger redirects the old slug to the new one, so a consumer
// holding it still resolves. Counting it as a removal made the anatomy phase
// report breaking, and the run verdict ORs across phases, so a pure rename
// stalled the nightly even after the registry verdict stopped calling it
// breaking.
var { consumerVisibleDeletions } = require("../scripts/sync/sync-anatomy.js");

// 🪤 pruneStaleAnatomy hands BARE SLUGS (sync-anatomy.js strips the extension
// before pushing), so these pass bare slugs. An earlier version passed
// "<slug>.json" and asserted the function echoed that back, pinning a contract
// the real caller never produces; only a defensive strip made it look right.

test("a deletion whose slug was renamed away is not consumer-visible", function () {
  assert.deepEqual(
    consumerVisibleDeletions(
      ["sticky-footer"],
      { "sticky-footer": "action-bar" },
      ["action-bar", "button"],
    ),
    [],
  );
});

test("a genuine removal is still consumer-visible", function () {
  assert.deepEqual(
    consumerVisibleDeletions(["alert-inline"], {}, ["button"]),
    ["alert-inline"],
  );
});

test("a rename whose successor has no anatomy is still consumer-visible", function () {
  // The ledger claims the slug moved, but nothing was written under the new
  // name, so the consumer following the redirect finds nothing. That is a loss,
  // and treating it as absorbed would hide it.
  assert.deepEqual(
    consumerVisibleDeletions(
      ["sticky-footer"],
      { "sticky-footer": "action-bar" },
      ["button"],
    ),
    ["sticky-footer"],
  );
});

test("syncAnatomy: a deletion absorbed by a rename is additive, not breaking", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.mkdirSync(anatomyDir, { recursive: true });
  // The anatomy file under the OLD slug. The registry now ships the component
  // under the new one, so pruning deletes this file.
  writeJsonReal(path.join(anatomyDir, "sticky-footer.json"), {
    slug: "sticky-footer",
  });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: {
        "action-bar": { nodeId: "1:1", category: "Action", importMethod: "set" },
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
              name: "Action bar",
              children: [
                {
                  type: "COMPONENT",
                  name: "Type=Default",
                  layoutMode: "HORIZONTAL",
                  itemSpacing: 8,
                  children: [{ type: "TEXT", name: "Label", characters: "Go" }],
                },
              ],
            },
          },
        },
      });
    },
  };
  var opts = {
    rest: fakeRest,
    registriesDir: registriesDir,
    anatomyDir: anatomyDir,
    keys: { dsKit: "F" },
    writeJson: writeJsonReal,
    syncedAt: "2026-08-18",
  };

  // Without the rename recorded, the deletion is a removal and stalls the night.
  var uninformed = await syncAnatomy(opts, "dsKit");
  assert.equal(uninformed.verdict.category, "breaking");

  // Same inputs, with the run's rename handed in: the old slug still resolves
  // through the ledger, so nothing was lost.
  writeJsonReal(path.join(anatomyDir, "sticky-footer.json"), {
    slug: "sticky-footer",
  });
  opts.absorbedRenames = { "sticky-footer": "action-bar" };
  var informed = await syncAnatomy(opts, "dsKit");
  assert.equal(informed.verdict.category, "additive");
});
