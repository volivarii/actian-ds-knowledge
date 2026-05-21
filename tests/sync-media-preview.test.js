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
    badge: { name: "Badge", nodeId: "8888:1111", page: "Badges" },
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
                {
                  id: "h:1",
                  type: "INSTANCE",
                  name: ".local - section header",
                },
                {
                  id: "ss:preview",
                  type: "FRAME",
                  name: "Preview",
                  children: [
                    // Title TEXT layer (the renderer skips this).
                    {
                      id: "t:1",
                      type: "TEXT",
                      name: "Title",
                      characters: "Overview",
                    },
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
              children: [{ id: "8888:1111", type: "FRAME", name: "Badge" }],
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
  return Object.assign(
    {
      getFile: function () {
        return Promise.resolve(tree);
      },
      getNodes: function (fileKey, ids) {
        // Real Figma /v1/nodes returns { nodes: { [id]: { document: <subtree> } } }.
        var pages = {};
        tree.document.children.forEach(function (p) {
          pages[p.id] = { document: p };
        });
        var resp = { nodes: {} };
        ids.forEach(function (id) {
          if (pages[id]) resp.nodes[id] = pages[id];
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
      fetchBinary: function () {
        return Promise.resolve(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
      },
    },
    overrides,
  );
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
  var srcId = syncMedia.findRoleSourceNode(
    page1,
    syncMedia.ROLE_FINDERS.preview,
  );
  assert.equal(srcId, "visual:preview");
});

test("findRoleSourceNode returns null when outer wrapper is absent", function () {
  var tree = defaultFileTree();
  var page2 = tree.document.children[1]; // Badges — no Design guidelines wrapper
  assert.equal(
    syncMedia.findRoleSourceNode(page2, syncMedia.ROLE_FINDERS.preview),
    null,
  );
});

test("findRoleSourceNode is case-insensitive on sub-section name", function () {
  var tree = defaultFileTree();
  var page1 = tree.document.children[0];
  // Match against lowercased sectionName works.
  var srcId = syncMedia.findRoleSourceNode(page1, { sectionName: "PREVIEW" });
  assert.equal(srcId, "visual:preview");
});

test("ROLE_FINDERS exports preview and all multi-image roles", function () {
  var keys = Object.keys(syncMedia.ROLE_FINDERS);
  assert.ok(keys.includes("preview"), "preview must be present");
  assert.ok(keys.includes("parts"), "parts must be present");
  assert.ok(keys.includes("variations"), "variations must be present");
  assert.ok(keys.includes("spacing"), "spacing must be present");
  assert.ok(keys.includes("behavior"), "behavior must be present");
  assert.ok(keys.includes("layout"), "layout must be present");
  assert.equal(syncMedia.ROLE_FINDERS.preview.sectionName, "Preview");
  assert.equal(syncMedia.ROLE_FINDERS.parts.capture, "all");
});

test("findRoleSourceNode returns all FRAME child ids for capture:all", function () {
  var page = {
    document: {
      type: "CANVAS",
      children: [
        {
          type: "FRAME",
          name: "Design guidelines",
          children: [
            {
              type: "FRAME",
              name: "Parts",
              children: [
                { type: "TEXT", name: "title", id: "t1" },
                { type: "FRAME", name: "Container", id: "f1" },
                { type: "FRAME", name: "Icon", id: "f2" },
              ],
            },
          ],
        },
      ],
    },
  };
  var out = syncMedia.findRoleSourceNode(page, {
    sectionName: "Parts",
    capture: "all",
  });
  assert.deepEqual(out, ["f1", "f2"]);
});

test("findRoleSourceNode returns one id for capture:first", function () {
  var page = {
    document: {
      type: "CANVAS",
      children: [
        {
          type: "FRAME",
          name: "Design guidelines",
          children: [
            {
              type: "FRAME",
              name: "Preview",
              children: [{ type: "FRAME", name: "Hero", id: "h1" }],
            },
          ],
        },
      ],
    },
  };
  var out = syncMedia.findRoleSourceNode(page, {
    sectionName: "Preview",
    capture: "first",
  });
  assert.equal(typeof out, "string");
  assert.equal(out, "h1");
});

test("findRoleSourceNode capture:all returns [sub.id] when sub-section has no FRAME children", function () {
  var page = {
    document: {
      type: "CANVAS",
      children: [
        {
          type: "FRAME",
          name: "Design guidelines",
          children: [
            {
              type: "FRAME",
              name: "Parts",
              id: "ss:parts",
              children: [
                { type: "TEXT", name: "Title", id: "t1" },
                { type: "INSTANCE", name: "Header", id: "h1" },
              ],
            },
          ],
        },
      ],
    },
  };
  var out = syncMedia.findRoleSourceNode(page, {
    sectionName: "Parts",
    capture: "all",
  });
  assert.deepEqual(out, ["ss:parts"]);
});

test("findRoleSourceNode capture:first returns sub.id when sub-section has no FRAME children", function () {
  var page = {
    document: {
      type: "CANVAS",
      children: [
        {
          type: "FRAME",
          name: "Design guidelines",
          children: [
            {
              type: "FRAME",
              name: "Preview",
              id: "ss:preview",
              children: [{ type: "TEXT", name: "Title", id: "t1" }],
            },
          ],
        },
      ],
    },
  };
  var out = syncMedia.findRoleSourceNode(page, {
    sectionName: "Preview",
    capture: "first",
  });
  assert.equal(typeof out, "string");
  assert.equal(out, "ss:preview");
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
  assert.ok(
    !fs.existsSync(badgePath),
    "badge preview.png must not be created (no wrapper)",
  );
  assert.deepEqual(result.captured, ["button/preview"]);
  // badge has no Design guidelines wrapper — all 6 roles collapse to slug-only.
  // button has Preview but not the other 5 roles (mock tree has only Preview).
  assert.deepEqual(result.missing, [
    "badge",
    "button:behavior",
    "button:layout",
    "button:parts",
    "button:spacing",
    "button:variations",
  ]);
});

test("idempotent: second run does not rewrite when bytes match", async function () {
  var dir = tmpdir();
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat1 = fs.statSync(path.join(dir, "button", "preview.png"));
  await new Promise(function (r) {
    setTimeout(r, 10);
  });
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat2 = fs.statSync(path.join(dir, "button", "preview.png"));
  assert.equal(stat1.mtimeMs, stat2.mtimeMs, "stable bytes → no rewrite");
});

test("page-name lookup tolerates leading/trailing whitespace on Figma side", async function () {
  // Real-world quirk (2026-05-19): designers pad Figma page names with
  // leading whitespace for visual sorting in the pages panel (e.g.
  // "     ✍️ Button"). The registry transformer trims these, so the
  // registry stores `page: "✍️ Button"` (clean) while Figma returns the
  // padded form. An exact-match lookup misses every padded page — first
  // real media-preview sync run captured 0/N components for this reason.
  var dir = tmpdir();
  // Custom mock that returns PADDED page names — registry stays trimmed.
  var paddedMock = mockRest();
  var origGetFile = paddedMock.getFile;
  paddedMock.getFile = function () {
    return origGetFile().then(function (resp) {
      resp.document.children.forEach(function (p) {
        p.name = "     " + p.name + "   "; // 5 leading + 3 trailing spaces
      });
      return resp;
    });
  };
  var result = await syncMedia.run({
    registry: registry,
    outputDir: dir,
    rest: paddedMock,
  });
  // Button still resolves despite whitespace mismatch — preview.png written.
  assert.ok(
    fs.existsSync(path.join(dir, "button", "preview.png")),
    "trimmed-vs-padded mismatch must not break page resolution",
  );
  assert.deepEqual(result.captured, ["button/preview"]);
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
      button: { name: "Button", nodeId: "7206:2643", page: "Buttons" },
      "button-cta": {
        name: "Button (CTA)",
        nodeId: "7206:2644",
        page: "Buttons",
      },
    },
  };
  var result = await syncMedia.run({
    registry: sharedReg,
    outputDir: dir,
    rest: mockRest(),
  });
  assert.deepEqual(result.captured, ["button-cta/preview", "button/preview"]);
  // Both files must exist and have the same bytes.
  var b1 = fs.readFileSync(path.join(dir, "button", "preview.png"));
  var b2 = fs.readFileSync(path.join(dir, "button-cta", "preview.png"));
  assert.ok(b1.equals(b2), "shared sub-section → identical bytes per slug");
});

test("run() writes <role>-<index>.png for capture:all roles with multiple FRAME children", async function () {
  var dir = tmpdir();
  // Build a custom tree that has a "Parts" sub-section with two FRAME children.
  var partsReg = {
    fileKey: "FILEKEY",
    components: {
      widget: { name: "Widget", nodeId: "1:1", page: "Widgets" },
    },
  };
  var partsTree = {
    document: {
      id: "0:0",
      type: "DOCUMENT",
      children: [
        {
          id: "p:w",
          type: "CANVAS",
          name: "Widgets",
          children: [
            {
              id: "dg:w",
              type: "FRAME",
              name: "Design guidelines",
              children: [
                {
                  id: "ss:parts",
                  type: "FRAME",
                  name: "Parts",
                  children: [
                    { id: "pt:title", type: "TEXT", name: "Title" },
                    { id: "pt:0", type: "FRAME", name: "Container" },
                    { id: "pt:1", type: "FRAME", name: "Icon" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  var partsRest = {
    getFile: function () {
      return Promise.resolve(partsTree);
    },
    getNodes: function (fileKey, ids) {
      var pages = {};
      partsTree.document.children.forEach(function (p) {
        pages[p.id] = { document: p };
      });
      var resp = { nodes: {} };
      ids.forEach(function (id) {
        if (pages[id]) resp.nodes[id] = pages[id];
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
      // Return distinguishable bytes per URL so we can tell the two apart.
      var seed = url.charCodeAt(url.length - 5);
      return Promise.resolve(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, seed, 0x0a, 0x1a, 0x0a]),
      );
    },
  };
  var result = await syncMedia.run({
    registry: partsReg,
    outputDir: dir,
    rest: partsRest,
  });
  // Two files must exist: parts-0.png and parts-1.png.
  var p0 = path.join(dir, "widget", "parts-0.png");
  var p1 = path.join(dir, "widget", "parts-1.png");
  assert.ok(fs.existsSync(p0), "parts-0.png must exist");
  assert.ok(fs.existsSync(p1), "parts-1.png must exist");
  // Captured entries reflect both indices.
  assert.ok(
    result.captured.includes("widget/parts-0"),
    "captured must include widget/parts-0",
  );
  assert.ok(
    result.captured.includes("widget/parts-1"),
    "captured must include widget/parts-1",
  );
});

test("run() routes Icons-category components to skipped, not missing", async function () {
  var dir = tmpdir();
  var iconsReg = {
    fileKey: "FILEKEY",
    components: {
      button: { name: "Button", nodeId: "7206:2643", page: "Buttons" },
      mongodb: {
        name: "MongoDB",
        nodeId: "9:1",
        page: "Icons",
        category: "Icons",
      },
    },
  };
  // rest stub mirrors existing tests: only "Buttons" page exists in the file tree.
  var result = await syncMedia.run({
    registry: iconsReg,
    outputDir: dir,
    rest: mockRest(),
  });
  assert.ok(
    result.skipped.includes("mongodb"),
    "Icons slug must appear in skipped",
  );
  assert.ok(
    !result.missing.some(function (m) {
      return /mongodb/.test(m);
    }),
    "Icons slug must not appear in missing",
  );
  assert.ok(
    result.captured.some(function (c) {
      return /^button/.test(c);
    }),
    "button must still be captured",
  );
});

test("orchestrator runs media-preview phase end-to-end", async function () {
  var pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "kn-plugin-"));
  fs.mkdirSync(path.join(pluginDir, "components", "dist", "registries"), {
    recursive: true,
  });
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
