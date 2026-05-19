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

// Registry mirrors real Actian DS Kit: each component has a `page` field
// (the Figma page name where the component lives) and a `nodeId` deep
// inside the page tree.
var registry = {
  fileKey: "FILEKEY",
  components: {
    button: { name: "Button", nodeId: "7206:2643", page: "Buttons" },
    badge:  { name: "Badge",  nodeId: "8888:1111", page: "Badges" },
  },
};

// Mock Figma file tree. Mirrors the post-rename state:
//   page → "Design guidelines" outer wrapper → "Preview" sub-section → inner visual FRAME
// Buttons page has the Preview sub-section properly set up; Badges page
// lacks the Design guidelines wrapper entirely (simulating an
// undocumented component).
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
            // Components section (component frame nested deep).
            {
              id: "c:1",
              type: "FRAME",
              name: "Components",
              children: [
                {
                  id: "c:1-body",
                  type: "FRAME",
                  name: "Body",
                  children: [
                    { id: "7206:2643", type: "COMPONENT_SET", name: "Button" },
                  ],
                },
              ],
            },
            // Outer "Design guidelines" wrapper with the Preview sub-section
            // (post-rename).
            {
              id: "dg:outer",
              type: "FRAME",
              name: "Design guidelines",
              children: [
                { id: "h:1", type: "INSTANCE", name: ".local - section header" },
                {
                  id: "ss:preview",
                  type: "FRAME",
                  name: "Preview",
                  children: [
                    // Title TEXT layer (the renderer skips this).
                    { id: "t:1", type: "TEXT", name: "Title", characters: "Overview" },
                    // The actual visual FRAME — this is what gets captured.
                    { id: "visual:preview", type: "FRAME", name: "Overview" },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "p:2",
          type: "CANVAS",
          name: "Badges",
          children: [
            {
              id: "c:2",
              type: "FRAME",
              name: "Components",
              children: [
                { id: "8888:1111", type: "FRAME", name: "Badge" },
              ],
            },
            // No Design guidelines wrapper on this page.
          ],
        },
      ],
    },
  };
}

function mockRest(overrides) {
  var tree = defaultFileTree();
  return Object.assign({
    getFile: function () { return Promise.resolve(tree); },
    getNodes: function (fileKey, ids) {
      // Real Figma /v1/nodes returns { nodes: { [id]: { document: <subtree> } } }.
      var pages = {};
      tree.document.children.forEach(function (p) { pages[p.id] = { document: p }; });
      var resp = { nodes: {} };
      ids.forEach(function (id) { if (pages[id]) resp.nodes[id] = pages[id]; });
      return Promise.resolve(resp);
    },
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
  var wrapper = syncMedia.findFrameByNameRecursive(page1, "Design guidelines");
  assert.ok(wrapper);
  assert.equal(wrapper.id, "dg:outer");
});

test("findRoleSourceNode finds inner visual FRAME inside Preview sub-section", function () {
  var tree = defaultFileTree();
  var page1 = tree.document.children[0];
  var srcId = syncMedia.findRoleSourceNode(page1, syncMedia.ROLE_FINDERS.preview);
  assert.equal(srcId, "visual:preview");
});

test("findRoleSourceNode returns null when outer wrapper is absent", function () {
  var tree = defaultFileTree();
  var page2 = tree.document.children[1]; // Badges — no Design guidelines wrapper
  assert.equal(syncMedia.findRoleSourceNode(page2, syncMedia.ROLE_FINDERS.preview), null);
});

test("findRoleSourceNode is case-insensitive on sub-section name", function () {
  var tree = defaultFileTree();
  var page1 = tree.document.children[0];
  // Match against lowercased sectionName works.
  var srcId = syncMedia.findRoleSourceNode(page1, { sectionName: "PREVIEW" });
  assert.equal(srcId, "visual:preview");
});

test("ROLE_FINDERS exports preview today; other roles deferred to multi-image phase", function () {
  assert.deepEqual(Object.keys(syncMedia.ROLE_FINDERS), ["preview"]);
  assert.equal(syncMedia.ROLE_FINDERS.preview.sectionName, "Preview");
});

test("writes preview.png from inner visual FRAME for components with Preview sub-section", async function () {
  var dir = tmpdir();
  var result = await syncMedia.run({
    registry: registry,
    outputDir: dir,
    rest: mockRest(),
  });
  var btnPath = path.join(dir, "button", "preview.png");
  var badgePath = path.join(dir, "badge", "preview.png");
  assert.ok(fs.existsSync(btnPath), "button preview.png must exist");
  assert.ok(!fs.existsSync(badgePath), "badge preview.png must not be created (no wrapper)");
  assert.deepEqual(result.captured, ["button/preview"]);
  assert.deepEqual(result.missing, ["badge"]);
});

test("idempotent: second run does not rewrite when bytes match", async function () {
  var dir = tmpdir();
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat1 = fs.statSync(path.join(dir, "button", "preview.png"));
  await new Promise(function (r) { setTimeout(r, 10); });
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat2 = fs.statSync(path.join(dir, "button", "preview.png"));
  assert.equal(stat1.mtimeMs, stat2.mtimeMs, "stable bytes → no rewrite");
});

test("slug whose page field is unknown lands in missing", async function () {
  var dir = tmpdir();
  var oddReg = {
    fileKey: "FILEKEY",
    components: {
      orphan: { name: "Orphan", nodeId: "9:9", page: "Nonexistent" },
    },
  };
  var result = await syncMedia.run({
    registry: oddReg,
    outputDir: dir,
    rest: mockRest(),
  });
  assert.deepEqual(result.captured, []);
  assert.deepEqual(result.missing, ["orphan"]);
});

test("multiple slugs on the same page share one capture", async function () {
  var dir = tmpdir();
  var sharedReg = {
    fileKey: "FILEKEY",
    components: {
      button:       { name: "Button",       nodeId: "7206:2643", page: "Buttons" },
      "button-cta": { name: "Button (CTA)", nodeId: "7206:2644", page: "Buttons" },
    },
  };
  var result = await syncMedia.run({ registry: sharedReg, outputDir: dir, rest: mockRest() });
  assert.deepEqual(result.captured, ["button-cta/preview", "button/preview"]);
  // Both files must exist and have the same bytes.
  var b1 = fs.readFileSync(path.join(dir, "button", "preview.png"));
  var b2 = fs.readFileSync(path.join(dir, "button-cta", "preview.png"));
  assert.ok(b1.equals(b2), "shared sub-section → identical bytes per slug");
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
