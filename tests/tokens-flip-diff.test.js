// tests/tokens-flip-diff.test.js
//
// P4a Task 5 — CSS/JSON flip-diff validation.
// Proves that tokens.candidate.css / tokens.candidate.json differ from the
// live tokens.css / tokens.json by EXACTLY the expected (ratified) set.
//
// CHECKPOINT: make this green → present to controller for P4b flip sign-off.
// DO NOT modify live tokens.json / tokens.css.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const LIVE_CSS = path.join(ROOT, "tokens", "tokens.css");
const CAND_CSS = path.join(
  ROOT,
  "tokens",
  "src",
  "derived",
  "tokens.candidate.css",
);
const LIVE_JSON = path.join(ROOT, "tokens", "tokens.json");
const CAND_JSON = path.join(
  ROOT,
  "tokens",
  "src",
  "derived",
  "tokens.candidate.json",
);

// ─── CSS parser ───────────────────────────────────────────────────────────────

/** Extract a map of { '--zen-varname': 'value' } from a CSS block body string. */
function parseVarMap(blockContent) {
  const vars = {};
  // Match --zen-name: value; including multi-line shadow values.
  // Values never contain `;` so [^;]* is safe; `\n` is included explicitly.
  const re = /--zen-([^:]+):\s*((?:[^;]|\n)*?);/g;
  let m;
  while ((m = re.exec(blockContent)) !== null) {
    const name = `--zen-${m[1].trim()}`;
    // Normalise whitespace in values (multi-line → single space)
    const value = m[2].trim().replace(/\s+/g, " ");
    vars[name] = value;
  }
  return vars;
}

/**
 * Parse a CSS file into three per-block var-maps:
 *   { actian: {...}, studio: {...}, explorer: {...} }
 *
 * Each block's content is extracted from `selector {` to the matching `}`.
 * No nested braces exist in these blocks so indexOf('}') is correct.
 */
function parseCssBlocks(cssText) {
  const selectors = [
    { name: "actian", marker: ":root," },
    { name: "studio", marker: '[data-theme="studio"]' },
    { name: "explorer", marker: '[data-theme="explorer"]' },
  ];

  const blocks = {};
  for (const { name, marker } of selectors) {
    const idx = cssText.indexOf(marker);
    if (idx === -1) throw new Error(`CSS block not found: ${name}`);
    const open = cssText.indexOf("{", idx);
    const close = cssText.indexOf("}", open);
    blocks[name] = parseVarMap(cssText.slice(open + 1, close));
  }
  return blocks;
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

function diffBlocks(live, cand) {
  const liveKeys = new Set(Object.keys(live));
  const candKeys = new Set(Object.keys(cand));

  const dropped = [...liveKeys].filter((k) => !candKeys.has(k)).sort();
  const added = [...candKeys].filter((k) => !liveKeys.has(k)).sort();
  const changed = [...liveKeys]
    .filter((k) => candKeys.has(k) && live[k] !== cand[k])
    .sort();

  return { dropped, added, changed };
}

// ─── Expected allowlists ──────────────────────────────────────────────────────

// DROPPED: all in actian block.
// The `stardard` (typo) → `standard` rename drops the 5 old-spelling vars.
const EXPECTED_DROPPED_ACTIAN = [
  "--zen-font-body-stardard-family",
  "--zen-font-body-stardard-letter-spacing",
  "--zen-font-body-stardard-line-height",
  "--zen-font-body-stardard-size",
  "--zen-font-body-stardard-weight",
];
// Studio and explorer had no stardard overrides → zero dropped there.

// ADDED in actian block (19 vars):
const EXPECTED_ADDED_ACTIAN = [
  // 6 new border semantic vars (md source has 11 borders; live had 5)
  "--zen-border-info",
  "--zen-border-primary",
  "--zen-border-reverse",
  "--zen-border-strong",
  "--zen-border-success",
  "--zen-border-warning",
  // 2 new bg semantic vars
  "--zen-color-bg-primary",
  "--zen-color-bg-reverse",
  // 1 new text semantic var
  "--zen-color-text-default",
  // 5 new body-display text-style vars (new style level)
  "--zen-font-body-display-family",
  "--zen-font-body-display-letter-spacing",
  "--zen-font-body-display-line-height",
  "--zen-font-body-display-size",
  "--zen-font-body-display-weight",
  // 5 body-standard vars (correct spelling — rename companion to DROPPED above)
  "--zen-font-body-standard-family",
  "--zen-font-body-standard-letter-spacing",
  "--zen-font-body-standard-line-height",
  "--zen-font-body-standard-size",
  "--zen-font-body-standard-weight",
].sort();

// ADDED in studio block (8 vars — theme overrides for new semantic vars):
// border-{default,disabled,subtle} were absent from studio/explorer live blocks
// (they were only in actian). New vars {info,primary,strong} also need overrides.
// color-bg-primary and color-text-primary need per-theme values.
const EXPECTED_ADDED_STUDIO = [
  "--zen-border-default",
  "--zen-border-disabled",
  "--zen-border-info",
  "--zen-border-primary",
  "--zen-border-strong",
  "--zen-border-subtle",
  "--zen-color-bg-primary",
  "--zen-color-text-primary",
].sort();

// ADDED in explorer block (same 8 vars as studio):
const EXPECTED_ADDED_EXPLORER = [
  "--zen-border-default",
  "--zen-border-disabled",
  "--zen-border-info",
  "--zen-border-primary",
  "--zen-border-strong",
  "--zen-border-subtle",
  "--zen-color-bg-primary",
  "--zen-color-text-primary",
].sort();

// ─── CHANGED — ratified causes (actian block) ─────────────────────────────────
//
// Cause A: neutral/cool-grey palette refresh (10 shades; neutral-500 unchanged)
const RATIFIED_NEUTRAL_PALETTE = new Set([
  "--zen-color-neutral-100",
  "--zen-color-neutral-200",
  "--zen-color-neutral-25",
  "--zen-color-neutral-300",
  "--zen-color-neutral-400",
  "--zen-color-neutral-50",
  "--zen-color-neutral-600",
  "--zen-color-neutral-700",
  "--zen-color-neutral-800",
  "--zen-color-neutral-900",
]);

// Cause B: semantic tokens derived from neutral shades
const RATIFIED_NEUTRAL_DERIVED = new Set([
  "--zen-border-default",
  "--zen-border-disabled",
  "--zen-border-subtle",
  "--zen-color-bg-disabled",
  "--zen-color-bg-muted",
  "--zen-color-bg-subtle",
  "--zen-color-icon-disabled",
  "--zen-color-icon-subtle",
  "--zen-color-text-placeholder",
  "--zen-color-text-placeholder-subtle",
  "--zen-color-text-secondary",
  "--zen-color-text-tertiary",
]);

// Cause C: .25 shade formula — chromatic-25 shades now neutralised
const RATIFIED_SHADE_25 = new Set([
  "--zen-color-bg-error", // error-25 derived
  "--zen-color-bg-info", // primary-25 derived
  "--zen-color-bg-selected", // primary-25 derived
  "--zen-color-bg-success", // success-25 derived
  "--zen-color-bg-warning", // warning-25 derived
  "--zen-color-error-25",
  "--zen-color-primary-25",
  "--zen-color-success-25",
  "--zen-color-warning-25",
]);

// Cause D: text.primary → primary-500 (#000000 → #0f5fdc)
const RATIFIED_TEXT_PRIMARY = new Set(["--zen-color-text-primary"]);

// Cause E: error-600 unification (#e6492d → #dc3514)
const RATIFIED_ERROR_600 = new Set([
  "--zen-border-error",
  "--zen-focus-ring-error",
]);

// Cause F: font.size.xs 10px → 11px; text-styles using xs propagate
const RATIFIED_FONT_XS = new Set([
  "--zen-font-body-micro-size",
  "--zen-font-label-micro-size",
  "--zen-font-size-xs",
]);

// All ratified changed vars in actian block (union of causes A–F):
const RATIFIED_CHANGED_ACTIAN = new Set([
  ...RATIFIED_NEUTRAL_PALETTE,
  ...RATIFIED_NEUTRAL_DERIVED,
  ...RATIFIED_SHADE_25,
  ...RATIFIED_TEXT_PRIMARY,
  ...RATIFIED_ERROR_600,
  ...RATIFIED_FONT_XS,
]);

// CHANGED in studio + explorer:
// .25 formula change ripples into primary-25 (theme-specific), and the
// neutralised neutral-25 ripples into bg-subtle.
// All other studio/explorer vars are unchanged (neutral-100..900 are theme-specific
// cool-grey palette kept from live, not actian's cool-grey).
const RATIFIED_CHANGED_THEME = new Set([
  "--zen-color-bg-info", // primary-25 derived
  "--zen-color-bg-selected", // primary-25 derived
  "--zen-color-bg-subtle", // neutral-25 derived
  "--zen-color-neutral-25", // .25 formula (neutral-25 per-theme)
  "--zen-color-primary-25", // .25 formula (primary-25 per-theme)
]);

// ─── Load files ───────────────────────────────────────────────────────────────

let liveCss, candCss, liveJson, candJson;
let liveBlocks, candBlocks;
let actianDiff, studioDiff, explorerDiff;

try {
  liveCss = fs.readFileSync(LIVE_CSS, "utf8");
  candCss = fs.readFileSync(CAND_CSS, "utf8");
  liveJson = JSON.parse(fs.readFileSync(LIVE_JSON, "utf8"));
  candJson = JSON.parse(fs.readFileSync(CAND_JSON, "utf8"));

  liveBlocks = parseCssBlocks(liveCss);
  candBlocks = parseCssBlocks(candCss);

  actianDiff = diffBlocks(liveBlocks.actian, candBlocks.actian);
  studioDiff = diffBlocks(liveBlocks.studio, candBlocks.studio);
  explorerDiff = diffBlocks(liveBlocks.explorer, candBlocks.explorer);
} catch (err) {
  // Re-throw so all tests fail with a clear message rather than silently
  throw new Error(`Failed to load/parse token files: ${err.message}`);
}

// ─── CSS diff tests ───────────────────────────────────────────────────────────

test("css:actian - files parse to non-empty var-maps", () => {
  assert.ok(
    Object.keys(liveBlocks.actian).length > 50,
    "live actian block must have > 50 vars",
  );
  assert.ok(
    Object.keys(candBlocks.actian).length > 50,
    "candidate actian block must have > 50 vars",
  );
});

test("css:actian - DROPPED is exactly the 5 stardard-typo vars (rename)", () => {
  assert.deepStrictEqual(
    actianDiff.dropped,
    EXPECTED_DROPPED_ACTIAN,
    `DROPPED mismatch. Got: ${JSON.stringify(actianDiff.dropped)}`,
  );
});

test("css:studio - DROPPED is empty", () => {
  assert.deepStrictEqual(
    studioDiff.dropped,
    [],
    `DROPPED mismatch in studio. Got: ${JSON.stringify(studioDiff.dropped)}`,
  );
});

test("css:explorer - DROPPED is empty", () => {
  assert.deepStrictEqual(
    explorerDiff.dropped,
    [],
    `DROPPED mismatch in explorer. Got: ${JSON.stringify(explorerDiff.dropped)}`,
  );
});

test("css:actian - ADDED is exactly the 19 expected vars", () => {
  assert.deepStrictEqual(
    actianDiff.added,
    EXPECTED_ADDED_ACTIAN,
    [
      "ADDED mismatch in actian block.",
      `Expected ${EXPECTED_ADDED_ACTIAN.length} vars; got ${actianDiff.added.length}.`,
      `Extra (unexpected): ${JSON.stringify(actianDiff.added.filter((v) => !EXPECTED_ADDED_ACTIAN.includes(v)))}`,
      `Missing (expected but absent): ${JSON.stringify(EXPECTED_ADDED_ACTIAN.filter((v) => !actianDiff.added.includes(v)))}`,
    ].join("\n"),
  );
});

test("css:studio - ADDED is exactly the 8 expected theme-override vars", () => {
  assert.deepStrictEqual(
    studioDiff.added,
    EXPECTED_ADDED_STUDIO,
    [
      "ADDED mismatch in studio block.",
      `Expected ${EXPECTED_ADDED_STUDIO.length} vars; got ${studioDiff.added.length}.`,
      `Extra: ${JSON.stringify(studioDiff.added.filter((v) => !EXPECTED_ADDED_STUDIO.includes(v)))}`,
      `Missing: ${JSON.stringify(EXPECTED_ADDED_STUDIO.filter((v) => !studioDiff.added.includes(v)))}`,
    ].join("\n"),
  );
});

test("css:explorer - ADDED is exactly the 8 expected theme-override vars", () => {
  assert.deepStrictEqual(
    explorerDiff.added,
    EXPECTED_ADDED_EXPLORER,
    [
      "ADDED mismatch in explorer block.",
      `Expected ${EXPECTED_ADDED_EXPLORER.length} vars; got ${explorerDiff.added.length}.`,
      `Extra: ${JSON.stringify(explorerDiff.added.filter((v) => !EXPECTED_ADDED_EXPLORER.includes(v)))}`,
      `Missing: ${JSON.stringify(EXPECTED_ADDED_EXPLORER.filter((v) => !explorerDiff.added.includes(v)))}`,
    ].join("\n"),
  );
});

test("css:actian - CHANGED has no unexpected vars (all must be ratified)", () => {
  const unexpected = actianDiff.changed.filter(
    (v) => !RATIFIED_CHANGED_ACTIAN.has(v),
  );
  assert.deepStrictEqual(
    unexpected,
    [],
    [
      `${unexpected.length} UNEXPECTED changed var(s) in actian block — must investigate:`,
      ...unexpected.map(
        (v) =>
          `  ${v}: live=${liveBlocks.actian[v]} → cand=${candBlocks.actian[v]}`,
      ),
    ].join("\n"),
  );
});

test("css:actian - CHANGED contains exactly the ratified 37 vars (none missing)", () => {
  const missingFromDiff = [...RATIFIED_CHANGED_ACTIAN]
    .filter((v) => !actianDiff.changed.includes(v))
    .sort();
  assert.deepStrictEqual(
    missingFromDiff,
    [],
    [
      `${missingFromDiff.length} ratified var(s) expected to change but did NOT change:`,
      ...missingFromDiff,
    ].join("\n"),
  );
});

test("css:studio - CHANGED has no unexpected vars", () => {
  const unexpected = studioDiff.changed.filter(
    (v) => !RATIFIED_CHANGED_THEME.has(v),
  );
  assert.deepStrictEqual(
    unexpected,
    [],
    [
      `${unexpected.length} UNEXPECTED changed var(s) in studio block:`,
      ...unexpected.map(
        (v) =>
          `  ${v}: live=${liveBlocks.studio[v]} → cand=${candBlocks.studio[v]}`,
      ),
    ].join("\n"),
  );
});

test("css:studio - CHANGED contains exactly the ratified 5 theme vars", () => {
  const expected = [...RATIFIED_CHANGED_THEME].sort();
  assert.deepStrictEqual(
    studioDiff.changed,
    expected,
    [
      "studio CHANGED set mismatch.",
      `Got: ${JSON.stringify(studioDiff.changed)}`,
      `Expected: ${JSON.stringify(expected)}`,
    ].join("\n"),
  );
});

test("css:explorer - CHANGED has no unexpected vars", () => {
  const unexpected = explorerDiff.changed.filter(
    (v) => !RATIFIED_CHANGED_THEME.has(v),
  );
  assert.deepStrictEqual(
    unexpected,
    [],
    [
      `${unexpected.length} UNEXPECTED changed var(s) in explorer block:`,
      ...unexpected.map(
        (v) =>
          `  ${v}: live=${liveBlocks.explorer[v]} → cand=${candBlocks.explorer[v]}`,
      ),
    ].join("\n"),
  );
});

test("css:explorer - CHANGED contains exactly the ratified 5 theme vars", () => {
  const expected = [...RATIFIED_CHANGED_THEME].sort();
  assert.deepStrictEqual(
    explorerDiff.changed,
    expected,
    [
      "explorer CHANGED set mismatch.",
      `Got: ${JSON.stringify(explorerDiff.changed)}`,
      `Expected: ${JSON.stringify(expected)}`,
    ].join("\n"),
  );
});

// ─── Ratified-cause spot checks ────────────────────────────────────────────────

test("css:ratified - neutral-100 refresh: #e4e4f0 → #c7c7ce", () => {
  assert.equal(liveBlocks.actian["--zen-color-neutral-100"], "#e4e4f0");
  assert.equal(candBlocks.actian["--zen-color-neutral-100"], "#c7c7ce");
});

test("css:ratified - neutral-25 refresh: #fbfbff → #f5f5f8", () => {
  assert.equal(liveBlocks.actian["--zen-color-neutral-25"], "#fbfbff");
  assert.equal(candBlocks.actian["--zen-color-neutral-25"], "#f5f5f8");
});

test("css:ratified - text.primary → primary-500: #000000 → #0f5fdc", () => {
  assert.equal(liveBlocks.actian["--zen-color-text-primary"], "#000000");
  assert.equal(candBlocks.actian["--zen-color-text-primary"], "#0f5fdc");
});

test("css:ratified - border-error error-600 unification: #e6492d → #dc3514", () => {
  assert.equal(liveBlocks.actian["--zen-border-error"], "#e6492d");
  assert.equal(candBlocks.actian["--zen-border-error"], "#dc3514");
});

test("css:ratified - focus-ring-error error-600 unification: #e6492d → #dc3514", () => {
  assert.equal(liveBlocks.actian["--zen-focus-ring-error"], "#e6492d");
  assert.equal(candBlocks.actian["--zen-focus-ring-error"], "#dc3514");
});

test("css:ratified - font-size-xs: 10px → 11px", () => {
  assert.equal(liveBlocks.actian["--zen-font-size-xs"], "10px");
  assert.equal(candBlocks.actian["--zen-font-size-xs"], "11px");
});

test("css:ratified - font-body-micro-size propagates xs: 10px → 11px", () => {
  assert.equal(liveBlocks.actian["--zen-font-body-micro-size"], "10px");
  assert.equal(candBlocks.actian["--zen-font-body-micro-size"], "11px");
});

test("css:ratified - font-label-micro-size propagates xs: 10px → 11px", () => {
  assert.equal(liveBlocks.actian["--zen-font-label-micro-size"], "10px");
  assert.equal(candBlocks.actian["--zen-font-label-micro-size"], "11px");
});

test("css:ratified - primary-25 .25 formula: #edf6ff → #f3f5f9", () => {
  assert.equal(liveBlocks.actian["--zen-color-primary-25"], "#edf6ff");
  assert.equal(candBlocks.actian["--zen-color-primary-25"], "#f3f5f9");
});

test("css:ratified - error-25 .25 formula: #fff4ec → #f8f4f3", () => {
  assert.equal(liveBlocks.actian["--zen-color-error-25"], "#fff4ec");
  assert.equal(candBlocks.actian["--zen-color-error-25"], "#f8f4f3");
});

test("css:ratified - success-25 .25 formula: #f0ffec → #f3f6f3", () => {
  assert.equal(liveBlocks.actian["--zen-color-success-25"], "#f0ffec");
  assert.equal(candBlocks.actian["--zen-color-success-25"], "#f3f6f3");
});

test("css:ratified - warning-25 .25 formula: #fff9e5 → #f7f4f2", () => {
  assert.equal(liveBlocks.actian["--zen-color-warning-25"], "#fff9e5");
  assert.equal(candBlocks.actian["--zen-color-warning-25"], "#f7f4f2");
});

// Rename verification
test("css:rename - stardard-family dropped from actian", () => {
  assert.ok(
    "--zen-font-body-stardard-family" in liveBlocks.actian,
    "must be in live",
  );
  assert.ok(
    !("--zen-font-body-stardard-family" in candBlocks.actian),
    "must NOT be in candidate",
  );
});

test("css:rename - standard-family added to actian (correct spelling)", () => {
  assert.ok(
    !("--zen-font-body-standard-family" in liveBlocks.actian),
    "must NOT be in live",
  );
  assert.ok(
    "--zen-font-body-standard-family" in candBlocks.actian,
    "must be in candidate",
  );
});

// Motion guard: no motion vars in candidate CSS (motion is JSON-only at this stage)
test("css:motion - no --zen-motion-* vars emitted to candidate CSS", () => {
  const motionVars = Object.keys(candBlocks.actian).filter((v) =>
    v.startsWith("--zen-motion-"),
  );
  assert.deepStrictEqual(
    motionVars,
    [],
    `Unexpected motion vars in CSS: ${JSON.stringify(motionVars)}`,
  );
});

// Shadows unchanged
test("css:shadows - unchanged in candidate (live and candidate match)", () => {
  const shadowVars = [
    "--zen-shadow-xs",
    "--zen-shadow-sm",
    "--zen-shadow-md",
    "--zen-shadow-lg",
    "--zen-shadow-xl",
  ];
  for (const v of shadowVars) {
    assert.equal(
      candBlocks.actian[v],
      liveBlocks.actian[v],
      `Shadow var ${v} should not change`,
    );
  }
});

// ─── JSON diff tests ──────────────────────────────────────────────────────────

test("json:metadata - live is frozen, candidate is unfrozen", () => {
  assert.equal(liveJson.$metadata._frozen, true, "live must be frozen");
  assert.equal(candJson.$metadata._frozen, false, "candidate must be unfrozen");
});

test("json:namespaces - candidate adds motion and shadow (no drops)", () => {
  const liveKeys = new Set(
    Object.keys(liveJson).filter(
      (k) => !k.startsWith("$") && k !== "_schema_version",
    ),
  );
  const candKeys = new Set(
    Object.keys(candJson).filter(
      (k) => !k.startsWith("$") && k !== "_schema_version",
    ),
  );

  const dropped = [...liveKeys].filter((k) => !candKeys.has(k));
  const added = [...candKeys].filter((k) => !liveKeys.has(k)).sort();

  assert.deepStrictEqual(dropped, [], "no token namespaces should be dropped");
  assert.deepStrictEqual(
    added,
    ["motion", "shadow"],
    "exactly motion + shadow added",
  );
});

test("json:color - candidate adds color.primitive namespace", () => {
  const liveCKeys = Object.keys(liveJson.color);
  const candCKeys = Object.keys(candJson.color);
  assert.ok(
    !liveCKeys.includes("primitive"),
    "live must NOT have color.primitive",
  );
  assert.ok(
    candCKeys.includes("primitive"),
    "candidate must have color.primitive",
  );
});

test("json:color.primitive - has 266 leaves across 26 palette families", () => {
  const prim = candJson.color.primitive;
  const families = Object.keys(prim);
  assert.equal(
    families.length,
    26,
    `Expected 26 primitive families, got ${families.length}`,
  );

  function countLeaves(d) {
    let n = 0;
    for (const v of Object.values(d)) {
      if (v && typeof v === "object" && "$value" in v) n++;
      else if (v && typeof v === "object") n += countLeaves(v);
    }
    return n;
  }
  const leafCount = countLeaves(prim);
  assert.equal(
    leafCount,
    266,
    `Expected 266 primitive leaves, got ${leafCount}`,
  );
});

test("json:font - candidate adds font.text-styles namespace with 13 styles", () => {
  assert.ok(
    !("text-styles" in liveJson.font),
    "live must NOT have font.text-styles",
  );
  assert.ok(
    "text-styles" in candJson.font,
    "candidate must have font.text-styles",
  );
  assert.equal(
    Object.keys(candJson.font["text-styles"]).length,
    13,
    `Expected 13 text styles, got ${Object.keys(candJson.font["text-styles"]).length}`,
  );
});

test("json:motion - candidate has 10 motion leaves (delay/duration/ease)", () => {
  function flatLeaves(d, prefix = "") {
    const keys = [];
    for (const [k, v] of Object.entries(d)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && "$value" in v) keys.push(full);
      else if (v && typeof v === "object") keys.push(...flatLeaves(v, full));
    }
    return keys;
  }
  const motionLeaves = flatLeaves(candJson.motion);
  assert.equal(
    motionLeaves.length,
    10,
    `Expected 10 motion leaves, got ${motionLeaves.length}: ${JSON.stringify(motionLeaves)}`,
  );
});

test("json:shadow - candidate has 5 shadow leaves (xs/sm/md/lg/xl)", () => {
  const shadowKeys = Object.keys(candJson.shadow).sort();
  assert.deepStrictEqual(shadowKeys, ["lg", "md", "sm", "xl", "xs"]);
});

test("json:ratified - color.neutral.100 refreshed from #E4E4F0 (live) to cool-grey ref (candidate)", () => {
  // Live stores resolved hex; candidate uses DTCG token references to primitives.
  const liveVal = liveJson.color.neutral["100"].$value.toUpperCase();
  const candVal = candJson.color.neutral["100"].$value;

  assert.equal(
    liveVal,
    "#E4E4F0",
    "live neutral-100 must be the old cool-grey value",
  );

  // Candidate must reference the cool-grey primitive (not the old blue-tinted value)
  const isRef =
    typeof candVal === "string" && candVal.toLowerCase().includes("cool-grey");
  const isNewHex =
    typeof candVal === "string" && candVal.toUpperCase() === "#C7C7CE";
  assert.ok(
    isRef || isNewHex,
    `candidate color.neutral.100.$value must ref cool-grey or be #C7C7CE; got: ${candVal}`,
  );
});

test("json:ratified - color.text.primary → primary-500 reference (not black)", () => {
  const candVal = candJson.color.text.primary.$value;
  // Candidate uses DTCG references — accept any ref that resolves to primary-500 / royal-blue.500
  const isRef =
    typeof candVal === "string" &&
    (candVal.includes("primary.500") ||
      candVal.toLowerCase().includes("royal-blue") ||
      candVal.toUpperCase() === "#0F5FDC");
  assert.ok(
    isRef,
    `color.text.primary.$value must ref primary-500/royal-blue or be #0F5FDC; got: ${candVal}`,
  );
});

test("json:ratified - color.text.primary was #000000 in live", () => {
  const liveVal = liveJson.color.text.primary.$value.toUpperCase();
  assert.equal(liveVal, "#000000");
});

test("json:ratified - border.error uses error-600 (#DC3514)", () => {
  const candVal = candJson.border.error.$value.toUpperCase();
  assert.equal(
    candVal,
    "#DC3514",
    `border.error must be #DC3514 (error-600); got: ${candVal}`,
  );
});

test("json:ratified - font.size.xs changed: 10px → 11px", () => {
  assert.equal(liveJson.font.size.xs.$value, "10px");
  assert.equal(candJson.font.size.xs.$value, "11px");
});

test("json:frozen flag - candidate source/generatedBy indicates deriver", () => {
  const gen = candJson.$metadata.generatedBy;
  assert.ok(
    gen && gen.includes("scripts/tokens"),
    `generatedBy must reference scripts/tokens; got: ${gen}`,
  );
});
