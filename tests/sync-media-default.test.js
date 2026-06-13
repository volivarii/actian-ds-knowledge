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
