"use strict";
// Dependency-free sRGB-hex → OKLCH (Björn Ottosson's OKLab).

function srgbToLinear(c8) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToOklch(hex) {
  let h = String(hex).trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error("bad hex: " + hex);
  const r = srgbToLinear(parseInt(h.slice(0, 2), 16));
  const g = srgbToLinear(parseInt(h.slice(2, 4), 16));
  const b = srgbToLinear(parseInt(h.slice(4, 6), 16));
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.hypot(A, B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

function round(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }
function formatOklch({ L, C, H }) {
  return `oklch(${round(L, 4)} ${round(C, 4)} ${round(H, 1)})`;
}

module.exports = { hexToOklch, formatOklch };
