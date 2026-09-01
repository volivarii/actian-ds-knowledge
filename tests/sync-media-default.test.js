"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var sharp = require("sharp");
var D = require("../scripts/sync/sync-media-default");

// A genuinely transparent (alpha=0) 2×2 PNG so the white-flatten is actually
// exercised. A tRNS/palette "transparent" PNG can raw-decode to opaque, which
// would let the test pass even if .flatten() were removed.
function transparentPng() {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

test("encodeWhiteWebp emits a valid WebP container", async function () {
  var webp = await D.encodeWhiteWebp(await transparentPng());
  assert.equal(webp.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(webp.subarray(8, 12).toString("ascii"), "WEBP");
});

test("encodeWhiteWebp flattens transparent pixels onto white (not a no-op)", async function () {
  var webp = await D.encodeWhiteWebp(await transparentPng());
  var out = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
  // Flatten drops alpha (3 channels) and the formerly-transparent pixel is white.
  // If .flatten() were removed, the webp would keep alpha (channels===4) and the
  // pixel would be transparent black — both assertions would fail.
  assert.equal(out.info.channels, 3, "alpha should be flattened away");
  assert.equal(out.data[0], 255);
  assert.equal(out.data[1], 255);
  assert.equal(out.data[2], 255);
});

var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");

// A COMPONENT_SET tree whose first COMPONENT child is the default variant.
function setTree() {
  return {
    nodes: {
      "7206:2643": {
        document: {
          id: "7206:2643",
          type: "COMPONENT_SET",
          name: "Button",
          children: [
            {
              id: "7206:2644",
              type: "COMPONENT",
              name: "Type=Primary, Size=Default, State=Default",
            },
            {
              id: "7206:2645",
              type: "COMPONENT",
              name: "Type=Secondary, Size=Default, State=Default",
            },
          ],
        },
      },
    },
  };
}

function mockRest(overrides) {
  return Object.assign(
    {
      getNodes: function () {
        return Promise.resolve(setTree());
      },
      getImages: function (fileKey, ids) {
        var images = {};
        ids.forEach(function (id) {
          images[id] = "https://signed/" + id + ".png";
        });
        return Promise.resolve({ images: images });
      },
      fetchBinary: function () {
        return transparentPng();
      }, // reuse K1 helper → real PNG buffer
    },
    overrides,
  );
}

test("run() captures the default variant child as default.webp", async function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdef-"));
  try {
    var anatomyDir = path.join(tmp, "anatomy");
    var mediaDir = path.join(tmp, "media");
    fs.mkdirSync(anatomyDir, { recursive: true });
    fs.writeFileSync(
      path.join(anatomyDir, "button.json"),
      JSON.stringify({
        slug: "button",
        source: {
          fileKey: "FILEKEY",
          nodeId: "7206:2643",
          variant: "Type=Primary, Size=Default, State=Default",
        },
      }),
    );

    var captureImages = [];
    var rest = mockRest({
      getImages: function (fileKey, ids) {
        captureImages = ids.slice();
        var images = {};
        ids.forEach(function (id) {
          images[id] = "https://signed/" + id + ".png";
        });
        return Promise.resolve({ images: images });
      },
    });

    var res = await D.run({
      registry: { fileKey: "FILEKEY", components: { button: {} } },
      anatomyDir: anatomyDir,
      outputDir: mediaDir,
      rest: rest,
    });

    // It exported the DEFAULT CHILD (7206:2644), not the set (7206:2643).
    assert.deepEqual(captureImages, ["7206:2644"]);
    assert.deepEqual(res.captured, ["button/default"]);
    var out = path.join(mediaDir, "button", "default.webp");
    assert.ok(fs.existsSync(out), "default.webp written");
    var bytes = fs.readFileSync(out);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("run() captured counts only real writes on a second identical run", async function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdef-"));
  try {
    var anatomyDir = path.join(tmp, "anatomy");
    var mediaDir = path.join(tmp, "media");
    fs.mkdirSync(anatomyDir, { recursive: true });
    fs.writeFileSync(
      path.join(anatomyDir, "button.json"),
      JSON.stringify({
        slug: "button",
        source: { fileKey: "FILEKEY", nodeId: "7206:2643" },
      }),
    );
    var opts = {
      registry: { fileKey: "FILEKEY", components: { button: {} } },
      anatomyDir: anatomyDir,
      outputDir: mediaDir,
      rest: mockRest(),
    };
    var r1 = await D.run(opts);
    assert.deepEqual(r1.captured, ["button/default"]);
    var r2 = await D.run(opts);
    // byte-identical → no write → no capture → verdict stays unchanged
    assert.deepEqual(r2.captured, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("run() reports a slug with NO anatomy file as skipped, not missing", async function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdef-"));
  try {
    var res = await D.run({
      registry: { fileKey: "FILEKEY", components: { button: {} } },
      anatomyDir: path.join(tmp, "anatomy"), // empty — no button.json
      outputDir: path.join(tmp, "media"),
      rest: mockRest(),
    });
    assert.deepEqual(res.captured, []);
    assert.deepEqual(res.skipped, ["button"]); // no anatomy = out of scope
    assert.deepEqual(res.missing, []); // missing is reserved for real failures
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// A single COMPONENT (not a SET): pickDefaultVariant returns { node: doc,
// variant: null }, so capture must export the component's OWN node id — there
// is no child to descend into. Covers the non-set fallback the module header
// advertises.
function singleComponentTree() {
  return {
    nodes: {
      "900:1": {
        document: { id: "900:1", type: "COMPONENT", name: "Divider" },
      },
    },
  };
}

test("run() captures a non-set component via its own node id", async function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdef-"));
  try {
    var anatomyDir = path.join(tmp, "anatomy");
    var mediaDir = path.join(tmp, "media");
    fs.mkdirSync(anatomyDir, { recursive: true });
    fs.writeFileSync(
      path.join(anatomyDir, "divider.json"),
      JSON.stringify({
        slug: "divider",
        source: { fileKey: "FILEKEY", nodeId: "900:1", variant: null },
      }),
    );
    var captureImages = [];
    var rest = mockRest({
      getNodes: function () {
        return Promise.resolve(singleComponentTree());
      },
      getImages: function (fileKey, ids) {
        captureImages = ids.slice();
        var images = {};
        ids.forEach(function (id) {
          images[id] = "https://signed/" + id + ".png";
        });
        return Promise.resolve({ images: images });
      },
    });
    var res = await D.run({
      registry: { fileKey: "FILEKEY", components: { divider: {} } },
      anatomyDir: anatomyDir,
      outputDir: mediaDir,
      rest: rest,
    });
    assert.deepEqual(captureImages, ["900:1"]); // own id, not a child
    assert.deepEqual(res.captured, ["divider/default"]);
    assert.ok(fs.existsSync(path.join(mediaDir, "divider", "default.webp")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("run() reports a slug as missing when getImages returns no signed URL", async function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdef-"));
  try {
    var anatomyDir = path.join(tmp, "anatomy");
    var mediaDir = path.join(tmp, "media");
    fs.mkdirSync(anatomyDir, { recursive: true });
    fs.writeFileSync(
      path.join(anatomyDir, "button.json"),
      JSON.stringify({
        slug: "button",
        source: {
          fileKey: "FILEKEY",
          nodeId: "7206:2643",
          variant: "Type=Primary, Size=Default, State=Default",
        },
      }),
    );
    // Figma dropped the render — empty images map (the common under-load case).
    // The slug must land in `missing` (anatomy present, capture failed), not
    // crash, and no default.webp may be written.
    var rest = mockRest({
      getImages: function () {
        return Promise.resolve({ images: {} });
      },
    });
    var res = await D.run({
      registry: { fileKey: "FILEKEY", components: { button: {} } },
      anatomyDir: anatomyDir,
      outputDir: mediaDir,
      rest: rest,
    });
    assert.deepEqual(res.captured, []);
    assert.deepEqual(res.missing, ["button"]);
    assert.deepEqual(res.skipped, []);
    assert.ok(!fs.existsSync(path.join(mediaDir, "button", "default.webp")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Drives the phase THROUGH the orchestrator (sync-from-figma.run) rather than
// calling D.run directly — exercises the wiring block in sync-from-figma.js:
// the dskit.json load from outputDir, the disk guard (dskit + anatomy dir),
// the anatomyDir resolution (orchOpts.anatomyDir = <pluginDir>/.../anatomy),
// the args object, and the verdict shaping. Mirrors the media-preview
// orchestrator template (sync-media-preview.test.js): seeds dskit.json into
// the registries dir, builds a mock rest, calls orch.run({ phase, pluginDir,
// rest, keys, outputDir, mediaOutputDir, ... }), and asserts the webp landed
// AND result.errors.length === 0.
test("orchestrator runs media-default phase end-to-end", async function () {
  var pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "kn-plugin-mdef-"));
  var releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "kn-release-"));
  var artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "kn-arts-"));
  try {
    // Seed dskit.json into the orchestrator's expected outputDir (registries).
    fs.mkdirSync(path.join(pluginDir, "components", "dist", "registries"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(pluginDir, "components", "dist", "registries", "dskit.json"),
      JSON.stringify({
        fileKey: "FILEKEY",
        components: { button: { name: "Button", nodeId: "7206:2643" } },
      }),
    );

    // Seed the anatomy file the media-default phase reads (orchOpts.anatomyDir =
    // <pluginDir>/components/dist/anatomy). source.nodeId is the COMPONENT_SET
    // id the mock rest returns; the variant name matches the first SET child.
    var anatomyDir = path.join(pluginDir, "components", "dist", "anatomy");
    fs.mkdirSync(anatomyDir, { recursive: true });
    fs.writeFileSync(
      path.join(anatomyDir, "button.json"),
      JSON.stringify({
        slug: "button",
        source: {
          fileKey: "FILEKEY",
          nodeId: "7206:2643",
          variant: "Type=Primary, Size=Default, State=Default",
        },
      }),
    );

    var orch = require("../scripts/sync/sync-from-figma.js");
    var mediaDir = path.join(pluginDir, "components", "dist", "media");

    var result = await orch.run({
      phase: "media-default",
      pluginDir: pluginDir,
      rest: mockRest(), // COMPONENT_SET tree; signed urls; fetchBinary real PNG
      keys: { dsKit: "FILEKEY" },
      outputDir: path.join(pluginDir, "components", "dist", "registries"),
      releaseNotesDir: releaseDir,
      artifactsDir: artifactsDir,
      mediaOutputDir: mediaDir,
    });

    assert.equal(result.errors.length, 0, "no phase errors");
    var verdict = result.results.find(function (r) {
      return r.kind === "media-default";
    });
    assert.ok(verdict, "media-default result present");
    assert.deepEqual(
      verdict.captured,
      ["button/default"],
      "captured the default",
    );
    var out = path.join(mediaDir, "button", "default.webp");
    assert.ok(fs.existsSync(out), "button default.webp must exist");
    var bytes = fs.readFileSync(out);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");

    // K6: the sync run itself derives media/_index.json — previously only
    // guidelines-derive healed it afterwards, stacking a second version bump
    // (phantom untagged versions) on every media-writing sync.
    var idxPath = path.join(mediaDir, "_index.json");
    assert.ok(
      fs.existsSync(idxPath),
      "media/_index.json derived in the same sync run",
    );
    var idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
    assert.ok(idx.media.button, "button media indexed");
    var mi = result.results.find(function (r) {
      return r.kind === "media-index";
    });
    assert.ok(mi, "media-index phase result present");
    assert.equal(mi.wrote, true);
  } finally {
    fs.rmSync(pluginDir, { recursive: true, force: true });
    fs.rmSync(releaseDir, { recursive: true, force: true });
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  }
});

// #608: a DEFERRED slug has anatomy (restored, carried forward) but Figma
// publishes no node for it, by design and every night. Without deferral
// awareness it lands in `missing` — the bucket this module's own header calls
// "a real gap worth listing… keeps a non-empty `missing` meaningful as a
// regression signal". Six permanent false entries would blunt exactly that.
test("run() reports a DEFERRED slug as skipped, not as a capture failure", async function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdef-defer-"));
  try {
    var anatomyDir = path.join(tmp, "anatomy");
    fs.mkdirSync(anatomyDir, { recursive: true });
    // anatomy present (carried forward), but Figma returns no node for it
    fs.writeFileSync(
      path.join(anatomyDir, "gone.json"),
      JSON.stringify({ slug: "gone", source: { nodeId: "404:404" } }) + "\n",
    );
    var res = await D.run({
      registry: { fileKey: "FILEKEY", components: { gone: {} } },
      anatomyDir: anatomyDir,
      outputDir: path.join(tmp, "media"),
      rest: mockRest(),
      deferredSlugs: ["gone"],
    });
    assert.deepEqual(res.missing, [], "a deferral is not a capture failure");
    assert.deepEqual(res.skipped, ["gone"]);
    assert.deepEqual(res.captured, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("run() without the deferral list still reports a real capture failure as missing", async function () {
  // The inverse: the new awareness must not blunt the signal it protects.
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdef-real-"));
  try {
    var anatomyDir = path.join(tmp, "anatomy");
    fs.mkdirSync(anatomyDir, { recursive: true });
    fs.writeFileSync(
      path.join(anatomyDir, "gone.json"),
      JSON.stringify({ slug: "gone", source: { nodeId: "404:404" } }) + "\n",
    );
    var res = await D.run({
      registry: { fileKey: "FILEKEY", components: { gone: {} } },
      anatomyDir: anatomyDir,
      outputDir: path.join(tmp, "media"),
      rest: mockRest(),
    });
    assert.deepEqual(res.missing, ["gone"]);
    assert.deepEqual(res.skipped, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
