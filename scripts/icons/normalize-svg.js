"use strict";

// Pure normalizer for one raw Figma SVG export → the icon body contract:
// inner markup only, viewBox 0 0 24 24, fills/strokes rewritten to
// currentColor. Returns { ok:true, viewBox, body } or { ok:false, reason }.
// reason ∈ { empty, render-failed, bad-viewbox, gradient-or-image-fill, multicolor }.

const { optimize } = require("svgo");

// SVGO cleanup: flatten transforms/groups, merge paths, fix precision, drop
// metadata + width/height. Keep viewBox (we read + assert it). Keep strokes
// (we recolor them — don't let SVGO drop "useless" ones).
const SVGO_CONFIG = {
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeViewBox: false,
          removeUselessStrokeAndFill: false,
        },
      },
    },
    "removeDimensions",
  ],
};

function normalizeIconSvg(rawSvg) {
  if (typeof rawSvg !== "string" || rawSvg.trim() === "") {
    return { ok: false, reason: "empty" };
  }

  let optimized;
  try {
    optimized = optimize(rawSvg, SVGO_CONFIG).data;
  } catch (_e) {
    return { ok: false, reason: "render-failed" };
  }

  // SVGO self-closes empty SVGs (<svg .../>) — detect and treat as empty.
  const selfClose = optimized.match(/<svg\b[^>]*\/>/i);
  if (selfClose) return { ok: false, reason: "empty" };

  const open = optimized.match(/<svg\b[^>]*>/i);
  const closeIdx = optimized.lastIndexOf("</svg>");
  if (!open || closeIdx === -1) return { ok: false, reason: "render-failed" };

  const vbMatch = open[0].match(/viewBox="([^"]*)"/i);
  const viewBox = vbMatch ? vbMatch[1].trim().replace(/\s+/g, " ") : null;
  if (viewBox !== "0 0 24 24") return { ok: false, reason: "bad-viewbox" };

  let body = optimized.slice(open.index + open[0].length, closeIdx).trim();
  if (body === "") return { ok: false, reason: "empty" };

  // Gradients / pattern / image / url(#...) paints can't become currentColor.
  if (
    /<(linearGradient|radialGradient|pattern|image)\b/i.test(body) ||
    /url\(#/i.test(body)
  ) {
    return { ok: false, reason: "gradient-or-image-fill" };
  }

  // Distinct visible paints (exclude none / currentColor).
  // Also count shapes with no explicit fill — SVG default is black, so they
  // contribute an implicit "#000000" paint.
  const paints = new Set();
  const scan = /(?:fill|stroke)="([^"]*)"/gi;
  let m;
  while ((m = scan.exec(body)) !== null) {
    const v = m[1].trim().toLowerCase();
    if (v === "none" || v === "currentcolor") continue;
    paints.add(v);
  }
  if (
    /<(?:path|circle|rect|ellipse|polygon|polyline|line)\b(?![^>]*\bfill=)[^>]*>/i.test(
      body,
    )
  ) {
    paints.add("#000000");
  }
  if (paints.size > 1) return { ok: false, reason: "multicolor" };

  // Rewrite explicit non-none fills/strokes to currentColor.
  body = body.replace(/(fill|stroke)="([^"]*)"/gi, (full, attr, val) =>
    val.trim().toLowerCase() === "none"
      ? `${attr}="none"`
      : `${attr}="currentColor"`,
  );

  // No visible paint at all → invisible glyph; treat as degraded, not shipped.
  if (!/(?:fill|stroke)="currentColor"/.test(body)) {
    return { ok: false, reason: "empty" };
  }

  return { ok: true, viewBox: "0 0 24 24", body };
}

module.exports = { normalizeIconSvg };
