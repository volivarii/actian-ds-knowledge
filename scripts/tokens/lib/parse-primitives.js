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
    // NB: palette names can contain hyphens (e.g. singapore-orchid-purple).
    // The `(?:[a-z]+-)*[a-z]+?` form matches the full hyphenated name, then the
    // optional `-(\d{2,3})` peels off the shade. Do NOT simplify to
    // `[a-z]+(?:-[a-z]+)*?` — its lazy tail collapses to the first word before a
    // shade digit group (royal-blue-25 would parse as palette "royal").
    const tok = line.match(
      /--zen-color-((?:[a-z]+-)*[a-z]+?)(?:-(\d{2,3}))?\b/,
    );
    if (!tok) continue;
    const palette = tok[1];
    const shade = tok[2] || null;
    if (EXCLUDE.has(palette)) continue;
    const hexMatch = line.match(/#([0-9a-fA-F]{6})\b/);
    if (!hexMatch) {
      // Skip lines that have no `#` character at all — these are role alias rows
      // (--zen-color-primary → --zen-color-royal-blue) or semantic reference rows
      // (border/shadow definitions that embed a --zen-color-* ref in a CSS value).
      // Only throw when the line explicitly attempted a hex value (has `#`) but it
      // is malformed (not 6 valid hex digits).
      if (!line.includes("#")) continue;
      throw new Error("primitive row has no valid 6-digit hex: " + line.trim());
    }
    out.push({ palette, shade, hex: "#" + hexMatch[1].toUpperCase() });
  }
  return out;
}

module.exports = { parsePrimitives };
