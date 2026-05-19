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
    badge:  { name: "Badge",  nodeId: "2:2", page: "Badges" },
  },
};

// Mock REST surface — only the methods the phase calls.
function mockRest(overrides) {
  return Object.assign({
    getNodes: function () {
      // Page tree for both components. Buttons page has an "Overview" frame,
      // Badges page does not.
      return Promise.resolve({
        nodes: {
          "1:1": { document: { children: [
            { id: "100:0", name: "Overview", type: "FRAME" },
            { id: "100:1", name: "Variants", type: "FRAME" },
          ] } },
          "2:2": { document: { children: [
            { id: "200:1", name: "Anatomy", type: "FRAME" },
          ] } },
        },
      });
    },
    getImages: function (fileKey, ids) {
      var images = {};
      ids.forEach(function (id) { images[id] = "https://signed/" + id + ".png"; });
      return Promise.resolve({ images: images });
    },
    fetchBinary: function (url) {
      return Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    },
  }, overrides);
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
  assert.ok(fs.existsSync(btnPath), "button preview.png must exist (sourced from Figma 'Overview' frame)");
  assert.ok(!fs.existsSync(badgePath), "badge preview.png must not be created (no Overview frame)");
  assert.deepEqual(result.captured, ["button"]);
  assert.deepEqual(result.missing, ["badge"]);
});

test("idempotent: second run does not re-fetch when bytes match", async function () {
  var dir = tmpdir();
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat1 = fs.statSync(path.join(dir, "button", "preview.png"));
  // Small sleep so mtime would change if rewritten.
  await new Promise(function (r) { setTimeout(r, 10); });
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat2 = fs.statSync(path.join(dir, "button", "preview.png"));
  assert.equal(stat1.mtimeMs, stat2.mtimeMs, "stable bytes → no rewrite");
});

test("findPreviewSourceNode is case-insensitive on the 'Overview' name", function () {
  var node = { document: { children: [{ id: "9:9", name: "OVERVIEW", type: "FRAME" }] } };
  assert.equal(syncMedia.findPreviewSourceNode(node), "9:9");
});

test("findPreviewSourceNode ignores non-FRAME types", function () {
  var node = { document: { children: [{ id: "9:9", name: "Overview", type: "GROUP" }] } };
  assert.equal(syncMedia.findPreviewSourceNode(node), null);
});

test("findPreviewSourceNode returns null on missing/empty children", function () {
  assert.equal(syncMedia.findPreviewSourceNode(null), null);
  assert.equal(syncMedia.findPreviewSourceNode({}), null);
  assert.equal(syncMedia.findPreviewSourceNode({ document: {} }), null);
  assert.equal(syncMedia.findPreviewSourceNode({ document: { children: [] } }), null);
});
