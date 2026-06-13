"use strict";

// sync-media-default — capture each component's DEFAULT VARIANT in isolation as
// components/dist/media/<slug>/default.webp. Unlike sync-media-preview (which
// captures section-frame "boards"), this exports a single component node so the
// fidelity gate has a single-component oracle to pixel-diff against.
//
// The default-variant node id is NOT stored in the anatomy dist (it records the
// COMPONENT_SET nodeId + the variant NAME). So we re-fetch the set and re-pick
// the default child with pickDefaultVariant (the same logic sync-anatomy uses),
// then export that child. Single (non-set) components export their own node.

var fs = require("fs");
var path = require("path");
var sharp = require("sharp");
var pickDefaultVariant = require("./sync-anatomy").pickDefaultVariant;

// Flatten alpha over white before WebP — component variants often sit on a
// transparent canvas, and the plugin gate's content-box trim keys off white bg.
function encodeWhiteWebp(pngBuf) {
  return sharp(pngBuf)
    .flatten({ background: "#ffffff" })
    .webp({ quality: 80 })
    .toBuffer();
}

module.exports = { encodeWhiteWebp: encodeWhiteWebp };
