"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var os = require("os");
var syncMedia = require("../scripts/sync/sync-media-preview.js");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "media-sync-"));
}

// Mock registry: 2 components, one has an Overview frame, one doesn't.
var registry = {
  fileKey: "FILEKEY",
  components: {
    button: { name: "Button", nodeId: "1:1", page: "Buttons" },
    badge: { name: "Badge", nodeId: "2:2", page: "Badges" },
  },
};

// Mock REST surface — only the methods the phase calls.
function mockRest(overrides) {
  // Real Figma file tree (depth=2):
  //   document (DOCUMENT) → children: [PAGE, PAGE, ...]
  //   each PAGE → children: [FRAME (component), FRAME (Overview), FRAME (Variants), ...]
  var defaultFile = {
    document: {
      id: "0:0",
      type: "DOCUMENT",
      children: [
        {
          id: "p:1",
          type: "CANVAS",
          name: "Buttons",
          children: [
            { id: "1:1", type: "FRAME", name: "Button" },
            { id: "100:0", type: "FRAME", name: "Overview" },
            { id: "100:1", type: "FRAME", name: "Variants" },
          ],
        },
        {
          id: "p:2",
          type: "CANVAS",
          name: "Badges",
          children: [
            { id: "2:2", type: "FRAME", name: "Badge" },
            { id: "200:1", type: "FRAME", name: "Anatomy" },
          ],
        },
      ],
    },
  };
  return Object.assign(
    {
      getFile: function () {
        return Promise.resolve(defaultFile);
      },
      getNodes: function (fileKey, ids) {
        // /v1/nodes returns the requested page subtrees; in the real API the
        // response is `{ nodes: { [id]: { document: <subtree>, ... } } }`.
        // We map back to our default file's pages by id.
        var pageMap = {};
        defaultFile.document.children.forEach(function (page) {
          pageMap[page.id] = { document: page };
        });
        var resp = { nodes: {} };
        ids.forEach(function (id) {
          if (pageMap[id]) resp.nodes[id] = pageMap[id];
        });
        return Promise.resolve(resp);
      },
      getImages: function (fileKey, ids) {
        var images = {};
        ids.forEach(function (id) {
          images[id] = "https://signed/" + id + ".png";
        });
        return Promise.resolve({ images: images });
      },
      fetchBinary: function (url) {
        return Promise.resolve(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
      },
    },
    overrides,
  );
}

test("writes preview.png for components with an Overview frame, skips others", async function () {
  var dir = tmpdir();
  var result = await syncMedia.run({
    registry: registry,
    outputDir: dir,
    rest: mockRest(),
  });
  var btnPath = path.join(dir, "button", "preview.png");
  var badgePath = path.join(dir, "badge", "preview.png");
  assert.ok(
    fs.existsSync(btnPath),
    "button preview.png must exist (sourced from Figma 'Overview' frame)",
  );
  assert.ok(
    !fs.existsSync(badgePath),
    "badge preview.png must not be created (no Overview frame)",
  );
  assert.deepEqual(result.captured, ["button"]);
  assert.deepEqual(result.missing, ["badge"]);
});

test("idempotent: second run does not re-fetch when bytes match", async function () {
  var dir = tmpdir();
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat1 = fs.statSync(path.join(dir, "button", "preview.png"));
  // Small sleep so mtime would change if rewritten.
  await new Promise(function (r) {
    setTimeout(r, 10);
  });
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat2 = fs.statSync(path.join(dir, "button", "preview.png"));
  assert.equal(stat1.mtimeMs, stat2.mtimeMs, "stable bytes → no rewrite");
});

test("findPreviewSourceNode is case-insensitive on the 'Overview' name", function () {
  var node = {
    document: { children: [{ id: "9:9", name: "OVERVIEW", type: "FRAME" }] },
  };
  assert.equal(syncMedia.findPreviewSourceNode(node), "9:9");
});

test("findPreviewSourceNode ignores non-FRAME types", function () {
  var node = {
    document: { children: [{ id: "9:9", name: "Overview", type: "GROUP" }] },
  };
  assert.equal(syncMedia.findPreviewSourceNode(node), null);
});

test("findPreviewSourceNode returns null on missing/empty children", function () {
  assert.equal(syncMedia.findPreviewSourceNode(null), null);
  assert.equal(syncMedia.findPreviewSourceNode({}), null);
  assert.equal(syncMedia.findPreviewSourceNode({ document: {} }), null);
  assert.equal(
    syncMedia.findPreviewSourceNode({ document: { children: [] } }),
    null,
  );
});

test("orchestrator runs media-preview phase when invoked with --phase media-preview", async function () {
  var fs2 = require("fs");
  var path2 = require("path");
  var os2 = require("os");
  var pluginDir = fs2.mkdtempSync(path2.join(os2.tmpdir(), "kn-plugin-"));
  fs2.mkdirSync(path2.join(pluginDir, "components", "dist", "registries"), {
    recursive: true,
  });
  fs2.writeFileSync(
    path2.join(pluginDir, "components", "dist", "registries", "dskit.json"),
    JSON.stringify(registry),
  );

  var orch = require("../scripts/sync/sync-from-figma.js");
  var releaseDir = fs2.mkdtempSync(path2.join(os2.tmpdir(), "kn-release-"));
  var artifactsDir = fs2.mkdtempSync(path2.join(os2.tmpdir(), "kn-arts-"));
  var mediaDir = path2.join(pluginDir, "components", "dist", "media");

  var result = await orch.run({
    phase: "media-preview",
    pluginDir: pluginDir,
    rest: mockRest(),
    keys: { dsKit: "FILEKEY" },
    outputDir: path2.join(pluginDir, "components", "dist", "registries"),
    releaseNotesDir: releaseDir,
    artifactsDir: artifactsDir,
    mediaOutputDir: mediaDir,
  });

  assert.equal(result.errors.length, 0, "no phase errors");
  assert.ok(fs2.existsSync(path2.join(mediaDir, "button", "preview.png")));
});

test("multiple components on the same page share one Overview frame", async function () {
  var dir = tmpdir();
  // Two components both on page "p:1" — both should capture from "100:0".
  var sharedReg = {
    fileKey: "FILEKEY",
    components: {
      button: { name: "Button", nodeId: "1:1", page: "Buttons" },
      "button-cta": { name: "Button (CTA)", nodeId: "1:2", page: "Buttons" },
    },
  };
  // Mock that adds button-cta as another child of page p:1.
  var customMock = mockRest();
  var origGetFile = customMock.getFile;
  customMock.getFile = function () {
    return origGetFile().then(function (resp) {
      // Inject button-cta into page p:1's children.
      resp.document.children[0].children.push({
        id: "1:2",
        type: "FRAME",
        name: "Button (CTA)",
      });
      return resp;
    });
  };
  var result = await syncMedia.run({
    registry: sharedReg,
    outputDir: dir,
    rest: customMock,
  });
  assert.deepEqual(result.captured, ["button", "button-cta"]);
  assert.equal(result.missing.length, 0);
  // Both files should exist with identical bytes (same Overview source).
  var btnBytes = fs.readFileSync(path.join(dir, "button", "preview.png"));
  var ctaBytes = fs.readFileSync(path.join(dir, "button-cta", "preview.png"));
  assert.ok(
    btnBytes.equals(ctaBytes),
    "shared overview → identical bytes per-slug",
  );
});
