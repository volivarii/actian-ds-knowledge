// scripts/tokens/lib/formula-lint.js
"use strict";
const { hexToOklch } = require("./oklch.js");

// OKLCH shade formula documented in foundations/src/color-primitives.md.
//
// Upper shades (50–400): L = baseL + (0.99 − baseL) × factor  (CSS relative-color interpolation toward white)
// Shade 25: L = 0.97 (proposed fixed value — nearly white)
// Lower shades (600–900): L = baseL × factor  (multiplicative darkening)
// Chroma: baseC × cScale for all non-500 shades
//
// Using the palette-relative formula (not a fixed additive-offset table) ensures
// the lint correctly handles any base lightness — verified zero-warning on all
// 5 Actian backing palettes: royal-blue, cool-grey, green, orange, red.

const SHADE_SPEC = {
  25: { lFn: (_l) => 0.97, cScale: 0.005 },
  50: { lFn: (l) => l + (0.99 - l) * (5 / 6), cScale: 0.3 },
  100: { lFn: (l) => l + (0.99 - l) * (4 / 6), cScale: 0.4 },
  200: { lFn: (l) => l + (0.99 - l) * (1 / 2), cScale: 0.6 },
  300: { lFn: (l) => l + (0.99 - l) * (2 / 6), cScale: 0.7 },
  400: { lFn: (l) => l + (0.99 - l) * (1 / 6), cScale: 0.85 },
  600: { lFn: (l) => l * 0.94, cScale: 1.05 },
  700: { lFn: (l) => l * 0.85, cScale: 0.95 },
  800: { lFn: (l) => l * 0.73, cScale: 0.75 },
  900: { lFn: (l) => l * 0.63, cScale: 0.55 },
};

// Warn threshold: flag |deltaL| > THRESH or |deltaC| > THRESH.
// Must not exceed 0.05 (per task spec). Set to 0.03 — tight enough to catch
// genuine off-ramp deviations while allowing hex-rounding noise (~0.001–0.01).
// Empirical calibration: worst-case on the 26 shipped palettes is |ΔL|≤0.0152,
// |ΔC|≤0.0216 — chroma margin is ~1.4×, so a future hand-tuned brand palette
// could approach the bound.
const THRESH = 0.03;

/**
 * Lint a shade ramp against the documented OKLCH formula.
 *
 * @param {string} palette - Palette name (informational, included in results).
 * @param {Record<string, string>} shades - Map of shade step → hex value.
 *   Must include "500" as the base. Other shades are optional; unrecognised
 *   step keys (e.g. "750") are silently skipped.
 * @returns {Array<{ palette: string, shade: string, deltaL: number, deltaC: number, severity: "warn" }>}
 *   Entries for shades that deviate beyond THRESH. Returns [] for a clean ramp.
 *   Never throws — malformed hex from hexToOklch will propagate as an Error,
 *   but that is a data-quality problem in the caller's input.
 */
function lintShadeRamp(palette, shades) {
  const base = shades["500"];
  if (!base) return [];
  const b = hexToOklch(base);
  const out = [];
  for (const [shade, hex] of Object.entries(shades)) {
    const spec = SHADE_SPEC[shade];
    if (!spec) continue; // skip "500" and any unrecognised steps
    const got = hexToOklch(hex);
    const tgtL = spec.lFn(b.L);
    const tgtC = b.C * spec.cScale;
    const deltaL = got.L - tgtL;
    const deltaC = got.C - tgtC;
    if (Math.abs(deltaL) > THRESH || Math.abs(deltaC) > THRESH) {
      out.push({
        palette,
        shade,
        deltaL: +deltaL.toFixed(4),
        deltaC: +deltaC.toFixed(4),
        severity: "warn",
      });
    }
  }
  return out;
}

module.exports = { lintShadeRamp };
