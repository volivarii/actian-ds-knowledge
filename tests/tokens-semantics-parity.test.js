"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const frozen = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tokens/tokens.json"), "utf8"),
);
const gen = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "tokens/src/derived/semantics.tokens.json"),
    "utf8",
  ),
);

const THEMES = ["actian", "studio", "explorer"];

/**
 * Walk a token sub-tree and collect all leaf paths that have
 * `$extensions.com.actian.themes` resolved hex values.
 * Returns a flat map: path -> { actian, studio, explorer }.
 */
function collectLeaves(obj, prefix) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v !== "object") continue;
    const p = prefix ? `${prefix}.${k}` : k;
    const ext = v["$extensions"];
    if (ext && ext["com.actian.themes"]) {
      result[p] = ext["com.actian.themes"];
    } else {
      Object.assign(result, collectLeaves(v, p));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// ALLOW map — each key is the full token path; the value is a one-line
// justification.  ALL entries are Bucket A (evidenced intentional diffs):
//   - "P1 neutral/cool-grey refresh" = the post-April ramp update ratified in
//     the P1 primitives parity gate (tokens-primitives-parity.test.js).
//   - "P1 .25 shade-formula" = the L 0.99→0.97, C *0.2→*0.005 formula update
//     for .25 shades, also P1-ratified.
//   - "md §N.M canonical" = the md file is the explicit authoritative source
//     for this change (semantic re-mapping or palette migration).
//
// Evidence for each entry is cross-referenced in
// docs/superpowers/notes/2026-06-25-tokens-p2-parity-diffs.md.
// ---------------------------------------------------------------------------
const ALLOW = {
  // --- Primitive palette diffs re-emitted in semantics.tokens.json ----------
  // These 14 diffs are the exact same allowlisted primitives from the P1 gate
  // (tokens-primitives-parity.test.js ALLOWLIST).  They appear here because
  // semantics.tokens.json includes the global role palette sections.
  "color.neutral.25":
    "P1 neutral.25 refresh + shade-formula (actian #FBFBFF→#F5F5F8; studio/explorer grey.25 #FCFCFC→#F8F4F5)",
  "color.neutral.50":
    "P1 neutral.50 refresh: actian cool-grey.50 #F5F5FA→#E1E1E6",
  "color.neutral.100":
    "P1 neutral.100 refresh: actian cool-grey.100 #E4E4F0→#C7C7CE",
  "color.neutral.200":
    "P1 neutral.200 refresh: actian cool-grey.200 #D3D3E5→#ADADB7",
  "color.neutral.300":
    "P1 neutral.300 refresh: actian cool-grey.300 #B9B9CD→#9494A0",
  "color.neutral.400":
    "P1 neutral.400 refresh: actian cool-grey.400 #9898A7→#7C7C8A",
  "color.neutral.600":
    "P1 neutral.600 refresh: actian cool-grey.600 #3F3F4A→#5C5C6C",
  "color.neutral.700":
    "P1 neutral.700 refresh: actian cool-grey.700 #33333D→#50505D",
  "color.neutral.800":
    "P1 neutral.800 refresh: actian cool-grey.800 #2A2A30→#40404A",
  "color.neutral.900":
    "P1 neutral.900 refresh: actian cool-grey.900 #12131F→#33333A",
  "color.primary.25":
    "P1 primary.25 shade-formula update: #EDF6FF→#F3F5F9 actian / #ECFFFF→studio+explorer values",
  "color.success.25":
    "P1 success.25 shade-formula update: green.25 #F0FFEC→#F3F6F3 (all themes)",
  "color.warning.25":
    "P1 warning.25 shade-formula update: orange.25 #FFF9E5→#F7F4F2 (all themes)",
  "color.error.25":
    "P1 error.25 shade-formula update: red.25 #FFF4EC→#F8F4F3 (all themes)",

  // --- Semantic bg diffs (downstream of P1 .25 shade-formula updates) -------
  "color.bg.error":
    "P1 error.25 downstream: bg.error→error-25 #FFF4EC→#F8F4F3 (all themes; md §2.8)",
  "color.bg.success":
    "P1 success.25 downstream: bg.success→success-25 #F0FFEC→#F3F6F3 (all themes; md §2.8)",
  "color.bg.warning":
    "P1 warning.25 downstream: bg.warning→warning-25 #FFF9E5→#F7F4F2 (all themes; md §2.8)",
  "color.bg.info":
    "P1 primary.25 downstream: bg.info→primary-25 #EDF6FF→#F3F5F9 actian / studio-explorer follow primary.25 per theme (md §2.8)",
  "color.bg.selected":
    "P1 primary.25 downstream + md rationalization: bg.selected remapped from frozen primary.50 to md-canonical primary.25; gen actian=#F3F5F9 (md §2.8)",

  // --- Semantic bg diffs (downstream of P1 neutral ramp refresh) ------------
  "color.bg.subtle":
    "P1 neutral.25 downstream: bg.subtle→neutral-25; actian #FBFBFF→#F5F5F8 (cool-grey.25), studio/explorer #FCFCFC→#F8F4F5 (grey.25) (md §2.8)",
  "color.bg.disabled":
    "P1 neutral.50 downstream: bg.disabled→neutral-50; actian cool-grey.50 #F5F5FA→#E1E1E6 (md §2.8)",
  "color.bg.muted":
    "P1 neutral.50 downstream: bg.muted→neutral-50; actian cool-grey.50 #F5F5FA→#E1E1E6 (md §2.8)",

  // --- Semantic text diffs (downstream of P1 neutral ramp refresh) ----------
  "color.text.secondary":
    "P1 neutral.800 downstream: text.secondary→neutral-800; actian cool-grey.800 #2A2A30→#40404A (md §2.2)",
  "color.text.tertiary":
    "P1 neutral.700 downstream: text.tertiary→neutral-700; actian cool-grey.700 #33333D→#50505D (md §2.2)",
  "color.text.placeholder":
    "P1 neutral.600 downstream: text.placeholder→neutral-600; actian cool-grey.600 #3F3F4A→#5C5C6C (md §2.2)",
  "color.text.placeholder-subtle":
    "P1 neutral.400 downstream: text.placeholder-subtle→neutral-400; actian cool-grey.400 #9898A7→#7C7C8A (md §2.2)",

  // --- Intentional semantic rename (md §2.2) --------------------------------
  "color.text.primary":
    "md §2.2 canonical rename: text.primary moves from black (#000000) to primary-500 (interactive text); old black → text.default (md §2.2 Proposed status acknowledged)",

  // --- Semantic icon diffs (downstream of P1 neutral ramp refresh) ----------
  "color.icon.subtle":
    "P1 neutral.600 downstream: icon.subtle→neutral-600; actian cool-grey.600 #3F3F4A→#5C5C6C (md §2.10)",
  "color.icon.disabled":
    "P1 neutral.400 downstream: icon.disabled→neutral-400; actian cool-grey.400 #9898A7→#7C7C8A (md §2.10)",
};

const frozenLeaves = collectLeaves(frozen.color, "color");
const genLeaves = collectLeaves(gen.color, "color");

// ---------------------------------------------------------------------------
// Test 1: Per-theme parity (excluding ALLOW)
// ---------------------------------------------------------------------------
test("generated semantic tokens match frozen per-theme hex (ALLOW-excluded)", () => {
  const unexplained = [];

  for (const [tokenPath, fThemes] of Object.entries(frozenLeaves)) {
    const gThemes = genLeaves[tokenPath];
    if (!gThemes) continue; // MISSING tokens handled separately in Test 2

    if (ALLOW[tokenPath]) continue; // ratified intentional diff

    const themeDiffs = [];
    for (const t of THEMES) {
      const fh = fThemes[t];
      const gh = gThemes[t];
      if (fh && gh && fh.toUpperCase() !== gh.toUpperCase()) {
        themeDiffs.push(`${t}: frozen=${fh} gen=${gh}`);
      }
    }
    if (themeDiffs.length) {
      unexplained.push(`${tokenPath} [${themeDiffs.join(" | ")}]`);
    }
  }

  assert.equal(
    unexplained.length,
    0,
    "UNEXPLAINED SEMANTIC PARITY DRIFT (not in ALLOW):\n" +
      unexplained.join("\n"),
  );
});

// Allowlist staleness guard: every ALLOW entry must still be a real divergence.
test("ALLOW entries are all still real divergences (no stale entries)", () => {
  const stale = [];
  for (const [tokenPath, justification] of Object.entries(ALLOW)) {
    const fThemes = frozenLeaves[tokenPath];
    const gThemes = genLeaves[tokenPath];
    if (!fThemes || !gThemes) {
      // Path missing from one side — still a real diff (not stale)
      continue;
    }
    const hasDiff = THEMES.some((t) => {
      const fh = fThemes[t];
      const gh = gThemes[t];
      return fh && gh && fh.toUpperCase() !== gh.toUpperCase();
    });
    if (!hasDiff) stale.push(`${tokenPath}: ${justification}`);
  }
  assert.equal(
    stale.length,
    0,
    "Stale ALLOW entries (now matching — remove them):\n" + stale.join("\n"),
  );
});

// ---------------------------------------------------------------------------
// Test 2: Plugin-consumed tokens must not be dropped from generated output
// ---------------------------------------------------------------------------
test("plugin-consumed tokens are present in generated semantics", () => {
  const PLUGIN_CONSUMED = [
    "color.text.primary",
    "color.text.secondary",
    "color.text.error",
    "color.text.link.default",
    "color.bg.default",
  ];
  const missing = PLUGIN_CONSUMED.filter((p) => !genLeaves[p]);
  assert.equal(
    missing.length,
    0,
    "Plugin-consumed tokens MISSING from generated semantics:\n" +
      missing.join("\n"),
  );
});
