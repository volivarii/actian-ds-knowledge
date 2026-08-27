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

// A real 1×1 PNG. The sync now transcodes Figma PNG captures to WebP via
// sharp, so fetchBinary mocks must return a decodable image rather than a
// fake magic-byte stub. sharp's WebP encode is deterministic, so the
// idempotency and shared-bytes assertions below still hold.
var REAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
  "base64",
);

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
        return Promise.resolve(REAL_PNG);
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

// The Figma "Parts" board was renamed; the parts role must resolve it under
// any of its aliases ("Parts" legacy, "Parts & tokens", "Anatomy"). Each
// returns the section's FRAME children (capture:"all"). Regression for the
// silent media loss (parts role captured 0 of 84 after the rename).
function partsPage(sectionName) {
  return {
    document: {
      type: "CANVAS",
      children: [
        {
          type: "FRAME",
          name: "Design guidelines",
          children: [
            {
              type: "FRAME",
              name: sectionName,
              children: [
                { type: "TEXT", name: "title", id: "t1" },
                { type: "FRAME", name: "Container", id: "f1" },
                { type: "FRAME", name: "Label", id: "f2" },
              ],
            },
          ],
        },
      ],
    },
  };
}

["Parts", "Parts & tokens", "Anatomy"].forEach(function (name) {
  test('parts role resolves the renamed section "' + name + '"', function () {
    var out = syncMedia.findRoleSourceNode(
      partsPage(name),
      syncMedia.ROLE_FINDERS.parts,
    );
    assert.deepEqual(out, ["f1", "f2"]);
  });
});

test('parts alias match is case-insensitive ("PARTS & TOKENS")', function () {
  var out = syncMedia.findRoleSourceNode(
    partsPage("PARTS & TOKENS"),
    syncMedia.ROLE_FINDERS.parts,
  );
  assert.deepEqual(out, ["f1", "f2"]);
});

test("ROLE_FINDERS.parts lists the Parts/Parts & tokens/Anatomy aliases", function () {
  assert.deepEqual(syncMedia.ROLE_FINDERS.parts.sectionNames, [
    "Parts",
    "Parts & tokens",
    "Anatomy",
  ]);
});

test("wrapperSubsectionNames lists the Design-guidelines sub-section names", function () {
  var tree = defaultFileTree();
  var page1 = { document: tree.document.children[0] };
  assert.deepEqual(syncMedia.wrapperSubsectionNames(page1), ["Preview"]);
  // No wrapper → empty (the Badges page).
  var page2 = { document: tree.document.children[1] };
  assert.deepEqual(syncMedia.wrapperSubsectionNames(page2), []);
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

test("writes preview.webp from inner visual FRAME for components with Preview sub-section", async function () {
  var dir = tmpdir();
  var result = await syncMedia.run({
    registry: registry,
    outputDir: dir,
    rest: mockRest(),
  });
  var btnPath = path.join(dir, "button", "preview.webp");
  var badgePath = path.join(dir, "badge", "preview.webp");
  assert.ok(fs.existsSync(btnPath), "button preview.webp must exist");
  assert.ok(
    !fs.existsSync(badgePath),
    "badge preview.webp must not be created (no wrapper)",
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
  var stat1 = fs.statSync(path.join(dir, "button", "preview.webp"));
  await new Promise(function (r) {
    setTimeout(r, 10);
  });
  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });
  var stat2 = fs.statSync(path.join(dir, "button", "preview.webp"));
  assert.equal(stat1.mtimeMs, stat2.mtimeMs, "stable bytes → no rewrite");
});

test("captured counts only real writes: second identical run reports zero captured", async function () {
  var dir = tmpdir();
  var r1 = await syncMedia.run({
    registry: registry,
    outputDir: dir,
    rest: mockRest(),
  });
  assert.ok(r1.captured.length > 0, "first run captures");
  var r2 = await syncMedia.run({
    registry: registry,
    outputDir: dir,
    rest: mockRest(),
  });
  // Byte-identical night: nothing was written, so nothing was "captured" —
  // this is what stops the phase from inflating every night to additive.
  assert.deepEqual(r2.captured, []);
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
  // Button still resolves despite whitespace mismatch — preview.webp written.
  assert.ok(
    fs.existsSync(path.join(dir, "button", "preview.webp")),
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
  var b1 = fs.readFileSync(path.join(dir, "button", "preview.webp"));
  var b2 = fs.readFileSync(path.join(dir, "button-cta", "preview.webp"));
  assert.ok(b1.equals(b2), "shared sub-section → identical bytes per slug");
});

test("run() writes <role>-<index>.webp for capture:all roles with multiple FRAME children", async function () {
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
    fetchBinary: function () {
      return Promise.resolve(REAL_PNG);
    },
  };
  var result = await syncMedia.run({
    registry: partsReg,
    outputDir: dir,
    rest: partsRest,
  });
  // Two files must exist: parts-0.webp and parts-1.webp.
  var p0 = path.join(dir, "widget", "parts-0.webp");
  var p1 = path.join(dir, "widget", "parts-1.webp");
  assert.ok(fs.existsSync(p0), "parts-0.webp must exist");
  assert.ok(fs.existsSync(p1), "parts-1.webp must exist");
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

test("prune: stale multi-image files are removed when role shrinks", async function () {
  var dir = tmpdir();
  // Pre-populate a widget/parts slug dir with 5 stale files (parts-0 … parts-4).
  var slugDir = path.join(dir, "widget");
  fs.mkdirSync(slugDir, { recursive: true });
  for (var i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(slugDir, "parts-" + i + ".webp"), "stale");
  }

  // Build a registry + tree that now yields only 3 "Parts" FRAME children.
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
                    { id: "pt:0", type: "FRAME", name: "Frame A" },
                    { id: "pt:1", type: "FRAME", name: "Frame B" },
                    { id: "pt:2", type: "FRAME", name: "Frame C" },
                    // Only 3 FRAME children — was 5 before.
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
    fetchBinary: function () {
      return Promise.resolve(REAL_PNG);
    },
  };

  await syncMedia.run({ registry: partsReg, outputDir: dir, rest: partsRest });

  // Surviving files: parts-0, parts-1, parts-2.
  assert.ok(
    fs.existsSync(path.join(slugDir, "parts-0.webp")),
    "parts-0.webp must survive",
  );
  assert.ok(
    fs.existsSync(path.join(slugDir, "parts-1.webp")),
    "parts-1.webp must survive",
  );
  assert.ok(
    fs.existsSync(path.join(slugDir, "parts-2.webp")),
    "parts-2.webp must survive",
  );
  // Stale files: parts-3 and parts-4 must be gone.
  assert.ok(
    !fs.existsSync(path.join(slugDir, "parts-3.webp")),
    "parts-3.webp must be pruned",
  );
  assert.ok(
    !fs.existsSync(path.join(slugDir, "parts-4.webp")),
    "parts-4.webp must be pruned",
  );
});

test("prune: all role files removed when role yields 0 frames (fully removed)", async function () {
  var dir = tmpdir();
  // Pre-populate widget/parts-0.webp … parts-2.webp as stale.
  var slugDir = path.join(dir, "widget");
  fs.mkdirSync(slugDir, { recursive: true });
  for (var i = 0; i < 3; i++) {
    fs.writeFileSync(path.join(slugDir, "parts-" + i + ".webp"), "stale");
  }
  // Also place a preview.webp that must NOT be touched by the prune.
  fs.writeFileSync(path.join(slugDir, "preview.webp"), "keep");

  // Build a registry + tree with NO Parts sub-section at all (0 frames).
  var partsReg = {
    fileKey: "FILEKEY",
    components: {
      widget: { name: "Widget", nodeId: "1:1", page: "Widgets" },
    },
  };
  var noPartsTree = {
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
                // No "Parts" sub-section — role is fully absent.
                {
                  id: "ss:preview",
                  type: "FRAME",
                  name: "Preview",
                  children: [
                    { id: "vis:preview", type: "FRAME", name: "Overview" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  var noPartsRest = {
    getFile: function () {
      return Promise.resolve(noPartsTree);
    },
    getNodes: function (fileKey, ids) {
      var pages = {};
      noPartsTree.document.children.forEach(function (p) {
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
      return Promise.resolve(REAL_PNG);
    },
  };

  var zeroResult = await syncMedia.run({
    registry: partsReg,
    outputDir: dir,
    rest: noPartsRest,
  });
  // Deletions are real content changes — they must be reported so the sync
  // commits them (a prune-only night must not strand deletions uncommitted).
  assert.equal(zeroResult.pruned, 3);

  // All stale parts-*.webp must be deleted (role fully removed).
  assert.ok(
    !fs.existsSync(path.join(slugDir, "parts-0.webp")),
    "parts-0.webp must be pruned (role fully removed)",
  );
  assert.ok(
    !fs.existsSync(path.join(slugDir, "parts-1.webp")),
    "parts-1.webp must be pruned (role fully removed)",
  );
  assert.ok(
    !fs.existsSync(path.join(slugDir, "parts-2.webp")),
    "parts-2.webp must be pruned (role fully removed)",
  );
  // preview.webp is capture:"first" — the prune must NOT touch it.
  assert.ok(
    fs.existsSync(path.join(slugDir, "preview.webp")),
    "preview.webp must NOT be pruned (capture:first)",
  );
});

test("prune guard: zero-count prune spanning many slugs is refused (section-rename protection)", async function () {
  var dir = tmpdir();
  // 5 slugs, each with an existing parts capture from prior syncs.
  var slugs = ["w1", "w2", "w3", "w4", "w5"];
  slugs.forEach(function (s) {
    var d = path.join(dir, s);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "parts-0.webp"), "stale");
  });
  // Every page still resolves (Preview present) but the "Parts" sub-section
  // is absent EVERYWHERE — the signature of a library-wide section rename
  // outside the alias list, not five simultaneous legitimate removals.
  var comps = {};
  var pages = slugs.map(function (s, i) {
    comps[s] = { name: s, nodeId: "n:" + i, page: "Page" + i };
    return {
      id: "p:" + i,
      type: "CANVAS",
      name: "Page" + i,
      children: [
        {
          id: "dg:" + i,
          type: "FRAME",
          name: "Design guidelines",
          children: [
            {
              id: "ss:pv" + i,
              type: "FRAME",
              name: "Preview",
              children: [{ id: "vis:" + i, type: "FRAME", name: "Overview" }],
            },
          ],
        },
      ],
    };
  });
  var guardReg = { fileKey: "FILEKEY", components: comps };
  var guardTree = {
    document: { id: "0:0", type: "DOCUMENT", children: pages },
  };
  var guardRest = {
    getFile: function () {
      return Promise.resolve(guardTree);
    },
    getNodes: function (fileKey, ids) {
      var byId = {};
      guardTree.document.children.forEach(function (p) {
        byId[p.id] = { document: p };
      });
      var resp = { nodes: {} };
      ids.forEach(function (id) {
        if (byId[id]) resp.nodes[id] = byId[id];
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
      return Promise.resolve(REAL_PNG);
    },
  };

  var result = await syncMedia.run({
    registry: guardReg,
    outputDir: dir,
    rest: guardRest,
  });

  // Every slug's parts capture SURVIVES — a mass zero-count prune is refused.
  slugs.forEach(function (s) {
    assert.ok(
      fs.existsSync(path.join(dir, s, "parts-0.webp")),
      s + "/parts-0.webp must survive a refused mass prune",
    );
  });
  // The refusal is surfaced so the sync changelog can warn about it.
  assert.ok(
    Array.isArray(result.pruneRefused),
    "run() must report pruneRefused",
  );
  assert.equal(result.pruneRefused.length, 1);
  assert.equal(result.pruneRefused[0].role, "parts");
  assert.deepEqual(result.pruneRefused[0].slugs.sort(), slugs);
});

test("prune guard: refusal also fires on the zero-pending early return (wrapper rename)", async function () {
  var dir = tmpdir();
  // 5 slugs with existing parts captures; pages resolve but the whole
  // "Design guidelines" wrapper is gone (outer-wrapper rename) → zero
  // pending entries → the early-return path must still refuse the prune.
  var slugs = ["w1", "w2", "w3", "w4", "w5"];
  slugs.forEach(function (s) {
    var d = path.join(dir, s);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "parts-0.webp"), "stale");
  });
  var comps = {};
  var pages = slugs.map(function (s, i) {
    comps[s] = { name: s, nodeId: "n:" + i, page: "Page" + i };
    return { id: "p:" + i, type: "CANVAS", name: "Page" + i, children: [] };
  });
  var reg = { fileKey: "FILEKEY", components: comps };
  var tree = { document: { id: "0:0", type: "DOCUMENT", children: pages } };
  var restStub = {
    getFile: function () {
      return Promise.resolve(tree);
    },
    getNodes: function (fileKey, ids) {
      var byId = {};
      tree.document.children.forEach(function (p) {
        byId[p.id] = { document: p };
      });
      var resp = { nodes: {} };
      ids.forEach(function (id) {
        if (byId[id]) resp.nodes[id] = byId[id];
      });
      return Promise.resolve(resp);
    },
    getImages: function () {
      return Promise.resolve({ images: {} });
    },
    fetchBinary: function () {
      return Promise.resolve(REAL_PNG);
    },
  };

  var result = await syncMedia.run({
    registry: reg,
    outputDir: dir,
    rest: restStub,
  });

  assert.equal(result.captured.length, 0);
  slugs.forEach(function (s) {
    assert.ok(
      fs.existsSync(path.join(dir, s, "parts-0.webp")),
      s + "/parts-0.webp must survive the early-return prune",
    );
  });
  assert.ok(Array.isArray(result.pruneRefused));
  assert.equal(result.pruneRefused.length, 1);
  assert.equal(result.pruneRefused[0].role, "parts");
});

test("prune guard boundary: exactly 3 zero-count slugs still prune (threshold is > 3)", async function () {
  var dir = tmpdir();
  var slugs = ["w1", "w2", "w3"];
  slugs.forEach(function (s) {
    var d = path.join(dir, s);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "parts-0.webp"), "stale");
  });
  var comps = {};
  var pages = slugs.map(function (s, i) {
    comps[s] = { name: s, nodeId: "n:" + i, page: "Page" + i };
    return {
      id: "p:" + i,
      type: "CANVAS",
      name: "Page" + i,
      children: [
        {
          id: "dg:" + i,
          type: "FRAME",
          name: "Design guidelines",
          children: [
            {
              id: "ss:pv" + i,
              type: "FRAME",
              name: "Preview",
              children: [{ id: "vis:" + i, type: "FRAME", name: "Overview" }],
            },
          ],
        },
      ],
    };
  });
  var reg = { fileKey: "FILEKEY", components: comps };
  var tree = { document: { id: "0:0", type: "DOCUMENT", children: pages } };
  var restStub = {
    getFile: function () {
      return Promise.resolve(tree);
    },
    getNodes: function (fileKey, ids) {
      var byId = {};
      tree.document.children.forEach(function (p) {
        byId[p.id] = { document: p };
      });
      var resp = { nodes: {} };
      ids.forEach(function (id) {
        if (byId[id]) resp.nodes[id] = byId[id];
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
      return Promise.resolve(REAL_PNG);
    },
  };

  var result = await syncMedia.run({
    registry: reg,
    outputDir: dir,
    rest: restStub,
  });

  // at the threshold (3, not more) the prune is a legitimate removal
  slugs.forEach(function (s) {
    assert.ok(
      !fs.existsSync(path.join(dir, s, "parts-0.webp")),
      s + "/parts-0.webp must be pruned at the threshold",
    );
  });
  assert.equal((result.pruneRefused || []).length, 0);
});

test("pruneLegacyPng: pre-WebP .png files are removed on sync", async function () {
  var dir = tmpdir();
  // Simulate a pre-migration media tree: legacy .png files on disk.
  var slugDir = path.join(dir, "button");
  fs.mkdirSync(slugDir, { recursive: true });
  fs.writeFileSync(path.join(slugDir, "preview.png"), "legacy");
  fs.writeFileSync(path.join(slugDir, "parts-0.png"), "legacy");

  await syncMedia.run({ registry: registry, outputDir: dir, rest: mockRest() });

  // Both legacy PNGs must be swept, regardless of capture mode.
  assert.ok(
    !fs.existsSync(path.join(slugDir, "preview.png")),
    "legacy preview.png must be removed",
  );
  assert.ok(
    !fs.existsSync(path.join(slugDir, "parts-0.png")),
    "legacy parts-0.png must be removed",
  );
  // The fresh WebP capture must be in place.
  assert.ok(
    fs.existsSync(path.join(slugDir, "preview.webp")),
    "preview.webp must be written",
  );
});

test("encodeWebp transcodes a PNG buffer to valid WebP", async function () {
  var webp = await syncMedia.encodeWebp(REAL_PNG);
  assert.ok(Buffer.isBuffer(webp), "encoder must return a Buffer");
  // WebP container: "RIFF" at offset 0, "WEBP" at offset 8.
  assert.equal(webp.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(webp.subarray(8, 12).toString("ascii"), "WEBP");
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
  assert.ok(fs.existsSync(path.join(mediaDir, "button", "preview.webp")));
});

// ---------------------------------------------------------------------------
// Family pages: one "Design guidelines" wrapper PER COMPONENT.
//
// Six pages in the DS file document a whole family (Checkbox/card/group,
// Radio/card/group, Text area+input, the four form Base parts, the three Tags,
// and the grids). Each component gets its own wrapper, and the wrapper's
// ".local - section header" instance names which one it is. The finder used to
// take the FIRST wrapper on the page for every slug, so 5 components shipped
// another component's imagery (#531).
//
// Fixtures below mirror the REAL titles from those pages, typo included.
// ---------------------------------------------------------------------------

function wrapper(id, title, previewFrameId) {
  return {
    id: id,
    type: "FRAME",
    name: "Design guidelines",
    children: [
      {
        id: id + ":hdr",
        type: "INSTANCE",
        name: ".local - section header",
        children: [
          { id: id + ":t", type: "TEXT", characters: title },
          {
            id: id + ":s",
            type: "TEXT",
            characters: "Structural breakdown, all variant states",
          },
        ],
      },
      {
        id: id + ":prev",
        type: "FRAME",
        name: "Preview",
        children: [{ id: previewFrameId, type: "FRAME", name: "Overview" }],
      },
    ],
  };
}

test("resolveWrapperForComponent: exact title match picks each family member's own wrapper", function () {
  var ws = [
    wrapper("w:1", "Checkbox design guidelines", "v:1"),
    wrapper("w:2", "Checkbox card design guidelines", "v:2"),
    wrapper("w:3", "Checkbox group design guidelines", "v:3"),
  ];
  assert.equal(syncMedia.resolveWrapperForComponent(ws, "Checkbox").id, "w:1");
  assert.equal(
    syncMedia.resolveWrapperForComponent(ws, "Checkbox card").id,
    "w:2",
  );
  assert.equal(
    syncMedia.resolveWrapperForComponent(ws, "Checkbox group").id,
    "w:3",
  );
});

test("resolveWrapperForComponent: ignores wrapper ORDER (the Text page is reversed)", function () {
  // Page is named "Text area, text input" but wrapper[0] documents Text input.
  // A positional rule would hand Text area the wrong board.
  var ws = [
    wrapper("w:in", "Text input design guidelines", "v:in"),
    wrapper("w:ar", "Text area design guidelines", "v:ar"),
  ];
  assert.equal(
    syncMedia.resolveWrapperForComponent(ws, "Text area").id,
    "w:ar",
    "must not fall back to the first wrapper",
  );
  assert.equal(
    syncMedia.resolveWrapperForComponent(ws, "Text input").id,
    "w:in",
  );
});

test("resolveWrapperForComponent: word ORDER inside the title does not matter", function () {
  // Registry says "Tag, Interactive"; Figma title says "Interactive Tag".
  var ws = [
    wrapper("w:ro", "Read-Only and Item Type Tag design guidelines", "v:ro"),
    wrapper("w:ix", "Interactive Tag design guidelines", "v:ix"),
  ];
  assert.equal(
    syncMedia.resolveWrapperForComponent(ws, "Tag, Interactive").id,
    "w:ix",
  );
});

test("resolveWrapperForComponent: a wrapper covering several members matches by subset", function () {
  var ws = [
    wrapper("w:ro", "Read-Only and Item Type Tag design guidelines", "v:ro"),
    wrapper("w:ix", "Interactive Tag design guidelines", "v:ix"),
  ];
  assert.equal(
    syncMedia.resolveWrapperForComponent(ws, "Tag, Item type").id,
    "w:ro",
    "one wrapper legitimately documents two components",
  );
});

test("resolveWrapperForComponent: no match returns null rather than guessing", function () {
  // The real Base page header reads "Massage (form base)" (a typo for Message).
  var base = [
    wrapper("w:l", "Label (form base) design guidelines", "v:l"),
    wrapper("w:m", "Massage (form base) design guidelines", "v:m"),
    wrapper("w:f", "Field (form base) design guidelines", "v:f"),
  ];
  assert.equal(syncMedia.resolveWrapperForComponent(base, "Message"), null);
  assert.equal(syncMedia.resolveWrapperForComponent(base, "Label").id, "w:l");

  // "Tag, Default" is called Read-Only in the guidelines, so it cannot resolve.
  var tag = [
    wrapper("w:ro", "Read-Only and Item Type Tag design guidelines", "v:ro"),
    wrapper("w:ix", "Interactive Tag design guidelines", "v:ix"),
  ];
  assert.equal(syncMedia.resolveWrapperForComponent(tag, "Tag, Default"), null);
});

test("resolveWrapperForComponent: ambiguity returns null rather than picking one", function () {
  var ws = [
    wrapper("w:a", "Radio design guidelines", "v:a"),
    wrapper("w:b", "Radio design guidelines", "v:b"),
  ];
  assert.equal(syncMedia.resolveWrapperForComponent(ws, "Radio"), null);
});

test("resolveWrapperForComponent: a single wrapper serves every slug on the page", function () {
  // Alert-banner + alert-inline share one wrapper. Unchanged behaviour.
  var ws = [wrapper("w:only", "Alert design guidelines", "v:only")];
  assert.equal(
    syncMedia.resolveWrapperForComponent(ws, "Alert banner").id,
    "w:only",
  );
  assert.equal(
    syncMedia.resolveWrapperForComponent(ws, "Anything at all").id,
    "w:only",
  );
});

function familyPageTree() {
  return {
    document: {
      id: "0:0",
      type: "DOCUMENT",
      children: [
        {
          id: "p:fam",
          type: "CANVAS",
          name: "Tag: Item type, Read-only, Interactive",
          children: [
            wrapper(
              "w:ro",
              "Read-Only and Item Type Tag design guidelines",
              "v:ro",
            ),
            wrapper("w:ix", "Interactive Tag design guidelines", "v:ix"),
          ],
        },
      ],
    },
  };
}

test("run(): each family member captures from ITS OWN wrapper", async function () {
  var dir = tmpdir();
  var tree = familyPageTree();
  var reg = {
    fileKey: "FILEKEY",
    components: {
      "tag-item-type": {
        name: "Tag, Item type",
        nodeId: "1:1",
        page: "Tag: Item type, Read-only, Interactive",
      },
      "tag-interactive": {
        name: "Tag, Interactive",
        nodeId: "1:2",
        page: "Tag: Item type, Read-only, Interactive",
      },
    },
  };
  var asked = [];
  var result = await syncMedia.run({
    registry: reg,
    outputDir: dir,
    rest: mockRest({
      getFile: function () {
        return Promise.resolve(tree);
      },
      getNodes: function (fileKey, ids) {
        var resp = { nodes: {} };
        ids.forEach(function (id) {
          if (id === "p:fam")
            resp.nodes[id] = { document: tree.document.children[0] };
        });
        return Promise.resolve(resp);
      },
      getImages: function (fileKey, ids) {
        ids.forEach(function (i) {
          asked.push(i);
        });
        var images = {};
        ids.forEach(function (id) {
          images[id] = "https://signed/" + id + ".png";
        });
        return Promise.resolve({ images: images });
      },
    }),
  });
  assert.deepEqual(result.captured.sort(), [
    "tag-interactive/preview",
    "tag-item-type/preview",
  ]);
  assert.ok(
    asked.indexOf("v:ix") !== -1,
    "the Interactive wrapper's frame must actually be rendered",
  );
  assert.ok(asked.indexOf("v:ro") !== -1, "and the Read-Only one too");
});

test("run(): an unmatchable family member captures NOTHING and is reported", async function () {
  var dir = tmpdir();
  var tree = familyPageTree();
  var reg = {
    fileKey: "FILEKEY",
    components: {
      // "Tag, Default" is called Read-Only in the guidelines: no honest match.
      "tag-read-only": {
        name: "Tag, Default",
        nodeId: "1:0",
        page: "Tag: Item type, Read-only, Interactive",
      },
      "tag-interactive": {
        name: "Tag, Interactive",
        nodeId: "1:2",
        page: "Tag: Item type, Read-only, Interactive",
      },
    },
  };
  var result = await syncMedia.run({
    registry: reg,
    outputDir: dir,
    rest: mockRest({
      getFile: function () {
        return Promise.resolve(tree);
      },
      getNodes: function (fileKey, ids) {
        var resp = { nodes: {} };
        ids.forEach(function (id) {
          if (id === "p:fam")
            resp.nodes[id] = { document: tree.document.children[0] };
        });
        return Promise.resolve(resp);
      },
    }),
  });
  assert.deepEqual(result.captured, ["tag-interactive/preview"]);
  assert.ok(
    !fs.existsSync(path.join(dir, "tag-read-only")),
    "no wrong image is written for the unmatched slug",
  );
  assert.ok(
    result.missing.indexOf("tag-read-only") !== -1,
    "the unmatched slug is reported as missing, not silently skipped",
  );
});
