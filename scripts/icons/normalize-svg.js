"use strict";

// Pure normalizer for one raw Figma SVG export → the icon body contract:
// inner markup only, a square origin-0 viewBox preserved as-is (Figma renders
// at 0 0 48 48; curated set is 0 0 24 24), fills/strokes rewritten to
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
    "convertStyleToAttrs",
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

  // Accept any square, origin-0 viewBox and preserve it. Figma renders the DS
  // Kit icons at "0 0 48 48"; the hand-curated set is "0 0 24 24". The SVG
  // viewBox makes the body resolution-independent, so consumers scale via the
  // <svg> element regardless of box size — no coordinate rescaling needed. A
  // non-square or non-origin box signals a malformed capture → degrade.
  const vbMatch = open[0].match(/viewBox="([^"]*)"/i);
  const viewBox = vbMatch ? vbMatch[1].trim().replace(/\s+/g, " ") : null;
  const vb = viewBox ? viewBox.split(" ").map(Number) : null;
  const vbOk =
    !!vb &&
    vb.length === 4 &&
    vb.every((n) => Number.isFinite(n)) &&
    vb[0] === 0 &&
    vb[1] === 0 &&
    vb[2] > 0 &&
    vb[2] === vb[3];
  if (!vbOk) return { ok: false, reason: "bad-viewbox" };

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

  // Implicit-black shapes: after the rewrite above, shape elements that still
  // carry no fill= and no stroke= are SVG-default black. Inject fill="currentColor"
  // so they are themeable. (Multicolor check already accounted for these as
  // "#000000" in the paint set above, so the monochrome guard already passed.)
  // Capture the attrs separately from the closing `/` or `>` so the injected
  // attribute lands INSIDE the tag for both self-closing and open forms.
  body = body.replace(
    /<(path|circle|rect|ellipse|polygon|polyline|line)\b([^>]*?)\s*(\/?)>/gi,
    (full, tag, attrs, slash) => {
      if (/\b(?:fill|stroke)=/i.test(attrs)) return full; // already painted — leave it
      return `<${tag}${attrs} fill="currentColor"${slash}>`;
    },
  );

  // No visible paint at all → invisible glyph; treat as degraded, not shipped.
  if (!/(?:fill|stroke)="currentColor"/.test(body)) {
    return { ok: false, reason: "empty" };
  }

  return { ok: true, viewBox, body };
}

module.exports = { normalizeIconSvg };
