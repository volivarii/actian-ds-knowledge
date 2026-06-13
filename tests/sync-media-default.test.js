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

test("run() skips a slug whose anatomy file is missing (no crash)", async function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdef-"));
  try {
    var res = await D.run({
      registry: { fileKey: "FILEKEY", components: { button: {} } },
      anatomyDir: path.join(tmp, "anatomy"), // empty — no button.json
      outputDir: path.join(tmp, "media"),
      rest: mockRest(),
    });
    assert.deepEqual(res.captured, []);
    assert.deepEqual(res.missing, ["button"]);
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
  // <pluginDir>/components/dist/anatomy). source.nodeId is the COMPONENT_SET id
  // the mock rest returns; the variant name matches the first SET child.
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
  var releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "kn-release-"));
  var artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "kn-arts-"));
  var mediaDir = path.join(pluginDir, "components", "dist", "media");

  var result = await orch.run({
    phase: "media-default",
    pluginDir: pluginDir,
    rest: mockRest(), // COMPONENT_SET tree; getImages signed urls; fetchBinary real PNG
    keys: { dsKit: "FILEKEY" },
    outputDir: path.join(pluginDir, "components", "dist", "registries"),
    releaseNotesDir: releaseDir,
    artifactsDir: artifactsDir,
    mediaOutputDir: mediaDir,
  });

  assert.equal(result.errors.length, 0, "no phase errors");
  var out = path.join(mediaDir, "button", "default.webp");
  assert.ok(fs.existsSync(out), "button default.webp must exist");
  var bytes = fs.readFileSync(out);
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
});
