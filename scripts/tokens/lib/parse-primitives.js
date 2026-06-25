// scripts/tokens/lib/parse-primitives.js
"use strict";
// Line-based parser for foundations/src/color-primitives.md.
// Palette + shade are derived from the token name (--zen-color-<palette>[-<shade>]),
// which is unambiguous across both the White/Black table and the per-palette tables.

const EXCLUDE = new Set(["warm-grey"]); // stray family, not a prescribed palette

function parsePrimitives(markdown) {
  const out = [];
  const lines = String(markdown).split(/\r?\n/);
  for (const line of lines) {
    if (line.indexOf("--zen-color-") === -1) continue;
    const tok = line.match(
      /--zen-color-((?:[a-z]+-)*[a-z]+?)(?:-(\d{2,3}))?\b/,
    );
    if (!tok) continue;
    const palette = tok[1];
    const shade = tok[2] || null;
    if (EXCLUDE.has(palette)) continue;
    const hexMatch = line.match(/#([0-9a-fA-F]{6})\b/);
    if (!hexMatch) {
      throw new Error("primitive row has no valid 6-digit hex: " + line.trim());
    }
    out.push({ palette, shade, hex: "#" + hexMatch[1].toUpperCase() });
  }
  return out;
}

module.exports = { parsePrimitives };
