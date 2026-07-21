"use strict";

// Color-preserving SVG normalization for the graphics asset tier. The icon
// normalizer (normalize-svg.js) rewrites every paint to currentColor and rejects
// multicolor, gradient, and image fills, because a UI glyph is monochrome. Artwork
// is multicolor brand content, so this keeps fills, strokes, and gradients verbatim
// and only does the color-agnostic work: strip Figma metadata and width/height,
// keep and assert viewBox, run SVGO in a color-preserving configuration. An embedded
// raster (an <image> or a data:image href) cannot scale and is flagged, not shipped.
var { optimize } = require("svgo");

// SVGO cleanup for artwork: flatten transforms/groups, fix precision, drop
// metadata + width/height. Keep viewBox (we read + assert it). Do NOT let
// preset-default touch color at all, and keep strokes/fills SVGO would
// otherwise call "useless"; this tier ships the paint verbatim.
var SVGO_CONFIG = {
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeViewBox: false,
          convertColors: false,
          mergePaths: false,
          removeUselessStrokeAndFill: false,
          removeUnknownsAndDefaults: false,
        },
      },
    },
    "removeDimensions",
    { name: "removeAttrs", params: { attrs: "(data-.*|data-figma.*)" } },
  ],
};

function normalizeGraphicSvg(rawSvg) {
  if (typeof rawSvg !== "string" || rawSvg.trim() === "") {
    return { ok: false, reason: "empty" };
  }

  // A raster fallback can't scale like vector artwork and is flagged, not
  // shipped, before we spend any SVGO work on it.
  if (/<image\b/i.test(rawSvg) || /href\s*=\s*["']data:image/i.test(rawSvg)) {
    return { ok: false, reason: "raster-backed" };
  }

  var vbMatch = /viewBox\s*=\s*["']([^"']+)["']/i.exec(rawSvg);
  if (!vbMatch) return { ok: false, reason: "bad-viewbox" };
  var viewBox = vbMatch[1].trim().replace(/\s+/g, " ");
  if (viewBox === "") return { ok: false, reason: "bad-viewbox" };

  var optimized;
  try {
    optimized = optimize(rawSvg, SVGO_CONFIG).data;
  } catch (_e) {
    return { ok: false, reason: "render-failed" };
  }

  // SVGO self-closes an empty root SVG (<svg .../>); detect that and treat it
  // as empty. Anchored to the whole trimmed output so a nested, legitimately
  // self-closed <svg/> child (for example a viewport marker) is not mistaken
  // for an empty document.
  var selfClose = /^\s*<svg\b[^>]*\/>\s*$/i.test(optimized.trim());
  if (selfClose) return { ok: false, reason: "empty" };

  var open = optimized.match(/<svg\b[^>]*>/i);
  var closeIdx = optimized.lastIndexOf("</svg>");
  if (!open || closeIdx === -1) return { ok: false, reason: "render-failed" };

  var body = optimized.slice(open.index + open[0].length, closeIdx).trim();
  if (!body) return { ok: false, reason: "empty" };

  return { ok: true, viewBox: viewBox, body: body };
}

module.exports = { normalizeGraphicSvg: normalizeGraphicSvg };
