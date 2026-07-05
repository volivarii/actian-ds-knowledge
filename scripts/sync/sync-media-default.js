"use strict";

// sync-media-default — capture each component's DEFAULT VARIANT in isolation as
// components/dist/media/<slug>/default.webp. Unlike sync-media-preview (which
// captures section-frame "boards"), this exports a single component node so the
// fidelity gate has a single-component oracle to pixel-diff against.
//
// The default-variant node id is NOT stored in the anatomy dist (it records the
// COMPONENT_SET nodeId + the variant NAME). So we re-fetch the set and re-pick
// the default child with pickDefaultVariant (the same logic sync-anatomy uses),
// then export that child. For a single (non-set) component, pickDefaultVariant
// returns { node: doc, variant: null } (node === the set/doc itself), so capture
// falls back to that node id and exports the component's own node.

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

function writeIfChanged(absPath, bytes) {
  if (fs.existsSync(absPath)) {
    var existing = fs.readFileSync(absPath);
    if (existing.length === bytes.length && existing.equals(bytes))
      return false;
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, bytes);
  return true;
}

// readSource — load components/dist/anatomy/<slug>.json → its source.nodeId.
// Returns null when the file is absent or malformed (→ slug reported missing).
function readSource(anatomyDir, slug) {
  var p = path.join(anatomyDir, slug + ".json");
  if (!fs.existsSync(p)) return null;
  try {
    var j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && j.source && j.source.nodeId ? j.source : null;
  } catch (_) {
    return null;
  }
}

async function run(opts) {
  if (!opts || !opts.registry)
    throw new Error("sync-media-default: opts.registry required");
  if (!opts.outputDir)
    throw new Error("sync-media-default: opts.outputDir required");
  if (!opts.anatomyDir)
    throw new Error("sync-media-default: opts.anatomyDir required");
  if (!opts.rest) throw new Error("sync-media-default: opts.rest required");

  var rest = opts.rest;
  var fileKey = opts.registry.fileKey;
  var slugs = Object.keys(opts.registry.components || {});

  // Resolve each slug → its set nodeId from anatomy. NO anatomy file → SKIPPED
  // (out of scope this run: anatomy hasn't covered the component — icons, or
  // components not yet anatomized). `missing` is reserved for slugs that DO have
  // anatomy but whose default node/render could not be captured — a real gap
  // worth listing. This mirrors sync-media-preview's skipped/missing split and
  // keeps a non-empty `missing` meaningful as a regression signal.
  var missing = [];
  var skipped = [];
  var setIdBySlug = {};
  slugs.forEach(function (slug) {
    var src = readSource(opts.anatomyDir, slug);
    if (!src) {
      skipped.push(slug);
      return;
    }
    setIdBySlug[slug] = src.nodeId;
  });
  var setIds = Array.from(new Set(Object.values(setIdBySlug)));
  if (setIds.length === 0)
    return { captured: [], missing: [], skipped: skipped.sort() };

  // Fetch the sets, pick the default child per slug. For a single (non-set)
  // component, pickDefaultVariant returns { node: doc, variant: null } (node ===
  // the set/doc) — never null — so capture falls back to the set id.
  var nodesResp = await rest.getNodes(fileKey, setIds);
  var nodes = (nodesResp && nodesResp.nodes) || {};
  var captureIdBySlug = {};
  Object.keys(setIdBySlug).forEach(function (slug) {
    var setId = setIdBySlug[slug];
    var doc = nodes[setId] && nodes[setId].document;
    if (!doc) {
      missing.push(slug);
      return;
    }
    var picked = pickDefaultVariant(doc); // { node, variant } | null
    captureIdBySlug[slug] = picked && picked.node ? picked.node.id : setId;
  });

  var captureIds = Array.from(new Set(Object.values(captureIdBySlug)));
  if (captureIds.length === 0)
    return {
      captured: [],
      missing: Array.from(new Set(missing)).sort(),
      skipped: skipped.sort(),
    };

  // Export → transcode → write.
  var imagesResp = await rest.getImages(fileKey, captureIds, {
    format: "png",
    scale: 2,
  });
  var urlMap = (imagesResp && imagesResp.images) || {};
  var bufferCache = {};
  var captured = [];
  var slugKeys = Object.keys(captureIdBySlug);
  for (var i = 0; i < slugKeys.length; i++) {
    var slug = slugKeys[i];
    var nodeId = captureIdBySlug[slug];
    var signed = urlMap[nodeId];
    if (!signed) {
      missing.push(slug);
      continue;
    }
    var bytes = bufferCache[nodeId];
    if (!bytes) {
      var png = await rest.fetchBinary(signed);
      bytes = await encodeWhiteWebp(png);
      bufferCache[nodeId] = bytes;
    }
    // Only a REAL write counts as captured (byte-identical re-render ≠ change).
    if (
      writeIfChanged(path.join(opts.outputDir, slug, "default.webp"), bytes)
    ) {
      captured.push(slug + "/default");
    }
  }

  return {
    captured: captured.sort(),
    missing: Array.from(new Set(missing)).sort(),
    skipped: skipped.sort(),
  };
}

module.exports = {
  encodeWhiteWebp: encodeWhiteWebp,
  run: run,
  readSource: readSource,
};
