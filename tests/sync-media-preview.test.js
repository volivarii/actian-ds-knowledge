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

// Two-component registry; one page has the nested Design-guidelines + Overview
// structure (button), the other lacks it (badge — only has an unrelated
// "Anatomy" frame, no Design-guidelines wrapper).
var registry = {
  fileKey: "FILEKEY",
  components: {
    button: { name: "Button", nodeId: "1:1", page: "Buttons" },
    badge:  { name: "Badge",  nodeId: "2:2", page: "Badges" },
  },
};

// Mock Figma file: real-world structure with "Overview" nested inside a
// "Design guidelines" wrapper frame on each component page.
function defaultFileTree() {
  return {
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
            {
              id: "dg:1",
              type: "FRAME",
              name: "Design guidelines",
              children: [
                { id: "100:0", type: "FRAME", name: "Overview" },
                { id: "100:1", type: "FRAME", name: "Parts" },
                { id: "100:2", type: "FRAME", name: "Variations" },
              ],
            },
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
}

function mockRest(overrides) {
  return Object.assign({
    getFile: function () { return Promise.resolve(defaultFileTree()); },
    getImages: function (fileKey, ids) {
      var images = {};
      ids.forEach(function (id) { images[id] = "https://signed/" + id + ".png"; });
      return Promise.resolve({ images: images });
    },
    fetchBinary: function () {
      return Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    },
  }, overrides);
}

test("findFrameByNameRecursive walks nested frames", function () {
  var tree = defaultFileTree();
  var page1 = tree.document.children[0];
  var found = syncMedia.findFrameByNameRecursive(page1, "Overview");
  assert.ok(found, "should find Overview deep inside Design guidelines");
  assert.equal(found.id, "100:0");
});

test("findFrameByNameRecursive is case-insensitive and returns null when absent", function () {
  var tree = defaultFileTree();
  var page1 = tree.document.children[0];
  assert.equal(syncMedia.findFrameByNameRecursive(page1, "OVERVIEW").id, "100:0");
  assert.equal(syncMedia.findFrameByNameRecursive(page1, "Spacing & size"), null);
});

test("findRoleSourceNode locates Overview inside Design guidelines wrapper", function () {
  var tree = defaultFileTree();
  var page1 = tree.document.children[0];
  var srcId = syncMedia.findRoleSourceNode(page1, syncMedia.ROLE_FINDERS.preview);
  assert.equal(srcId, "100:0");
});

test("findRoleSourceNode returns null when wrapper is absent", function () {
  var tree = defaultFileTree();
  var page2 = tree.document.children[1]; // Badges page — no Design guidelines wrapper
  assert.equal(syncMedia.findRoleSourceNode(page2, syncMedia.ROLE_FINDERS.preview), null);
});

test("ROLE_FINDERS exports preview today; future roles slot in as config entries", function () {
  assert.deepEqual(Object.keys(syncMedia.ROLE_FINDERS), ["preview"]);
  assert.equal(syncMedia.ROLE_FINDERS.preview.parent, "Design guidelines");
  assert.equal(syncMedia.ROLE_FINDERS.preview.child, "Overview");
});

test("writes preview.png for components with Design guidelines → Overview; skips others", async function () {
  var dir = tmpdir();
  var result = await syncMedia.run({
    registry: registry,
    outputDir: dir,
    rest: mockRest(),
  });
  var btnPath = path.join(dir, "button", "preview.png");
  var badgePath = path.join(dir, "badge", "preview.png");
  assert.ok(fs.existsSync(btnPath), "button preview.png must exist (Overview found inside Design guidelines)");
  assert.ok(!fs.existsSync(badgePath), "badge preview.png must not be created (no Design guidelines wrapper)");
  assert.deepEqual(result.captured, ["button/preview"]);
  assert.deepEqual(result.missing, ["badge"]);
});

test("idempotent: second run does not re-write when bytes match", async function () {
  var dir = tmpdir();
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat1 = fs.statSync(path.join(dir, "button", "preview.png"));
  await new Promise(function (r) { setTimeout(r, 10); });
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat2 = fs.statSync(path.join(dir, "button", "preview.png"));
  assert.equal(stat1.mtimeMs, stat2.mtimeMs, "stable bytes → no rewrite");
});

test("multiple components on the same page share one Overview frame", async function () {
  var dir = tmpdir();
  var sharedReg = {
    fileKey: "FILEKEY",
    components: {
      button:       { name: "Button",       nodeId: "1:1", page: "Buttons" },
      "button-cta": { name: "Button (CTA)", nodeId: "1:2", page: "Buttons" },
    },
  };
  // Mock that adds button-cta as another direct child of page p:1.
  var customMock = mockRest();
  var origGetFile = customMock.getFile;
  customMock.getFile = function () {
    return origGetFile().then(function (resp) {
      resp.document.children[0].children.push(
        { id: "1:2", type: "FRAME", name: "Button (CTA)" }
      );
      return resp;
    });
  };
  var result = await syncMedia.run({
    registry: sharedReg,
    outputDir: dir,
    rest: customMock,
  });
  assert.deepEqual(result.captured, ["button-cta/preview", "button/preview"]);
  assert.equal(result.missing.length, 0);
  var btnBytes = fs.readFileSync(path.join(dir, "button", "preview.png"));
  var ctaBytes = fs.readFileSync(path.join(dir, "button-cta", "preview.png"));
  assert.ok(btnBytes.equals(ctaBytes), "shared Overview frame → identical bytes per slug");
});

test("orchestrator runs media-preview phase end-to-end", async function () {
  var pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "kn-plugin-"));
  fs.mkdirSync(path.join(pluginDir, "components", "dist", "registries"), { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, "components", "dist", "registries", "dskit.json"),
    JSON.stringify(registry),
  );

  var orch = require("../scripts/sync/sync-from-figma.js");
  var releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "kn-release-"));
  var artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "kn-arts-"));
  var mediaDir = path.join(pluginDir, "components", "dist", "media");

  var result = await orch.run({
    phase: "media-preview",
    pluginDir: pluginDir,
    rest: mockRest(),
    keys: { dsKit: "FILEKEY" },
    outputDir: path.join(pluginDir, "components", "dist", "registries"),
    releaseNotesDir: releaseDir,
    artifactsDir: artifactsDir,
    mediaOutputDir: mediaDir,
  });

  assert.equal(result.errors.length, 0, "no phase errors");
  assert.ok(fs.existsSync(path.join(mediaDir, "button", "preview.png")));
});
