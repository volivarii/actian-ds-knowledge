"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { deriveSemanticTree } = require("../scripts/tokens/derive-tokens.js");

const ROOT = path.resolve(__dirname, "..");
const frozen = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tokens/tokens.json"), "utf8"),
);

// Derive semantic tree in-memory from authoritative sources, matching main()
const primitivesMd = fs.readFileSync(
  path.join(ROOT, "foundations", "src", "color-primitives.md"),
  "utf8",
);
const tokensMd = fs.readFileSync(
  path.join(ROOT, "foundations", "src", "tokens.md"),
  "utf8",
);
const rawBindings = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "tokens", "src", "figma-bindings-raw.json"),
    "utf8",
  ),
);

const gen = deriveSemanticTree({
  primitivesMd,
  semanticsMd: tokensMd,
  rawBindings,
});

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
// P4b flip (2026-06-26): the live tokens.json is now generator-owned.
// All previously ratified ALLOW entries have been cleared — the live file
// and the in-memory semantic tree are now in lockstep and match exactly.
// See docs/superpowers/notes/2026-06-25-tokens-p2-parity-diffs.md for history.
const ALLOW = {};

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

// ---------------------------------------------------------------------------
// Test 3: Freshness gate — committed artifact must not be stale
// ---------------------------------------------------------------------------
test("committed semantics.tokens.json is in sync with the deriver (not stale)", () => {
  const committed = fs.readFileSync(
    path.join(ROOT, "tokens/src/derived/semantics.tokens.json"),
    "utf8",
  );
  assert.equal(
    committed,
    JSON.stringify(gen, null, 2) + "\n",
    "tokens/src/derived/semantics.tokens.json is stale — re-run `node scripts/tokens/derive-tokens.js`",
  );
});
