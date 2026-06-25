"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  deriveNumericTree,
  deriveCompositeStyles,
  deriveMotion,
  deepMerge,
  attachBindings,
} = require("../scripts/tokens/derive-tokens.js");
const { curateNumericBindings } = require("../scripts/tokens/lib/curate-bindings.js");

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
const tokensMd = fs.readFileSync(
  path.join(ROOT, "foundations", "src", "tokens.md"),
  "utf8",
);
const primitivesMd = fs.readFileSync(
  path.join(ROOT, "foundations", "src", "color-primitives.md"),
  "utf8",
);
const rawBindings = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "tokens", "src", "figma-bindings-raw.json"),
    "utf8",
  ),
);

// ---------------------------------------------------------------------------
// Derive in-memory — mirror main()'s numeric assembly exactly.
// ---------------------------------------------------------------------------
const numericBase = deriveNumericTree({ tokensMd });
const compositeTree = deriveCompositeStyles({ tokensMd, primitivesMd });
const motionTree = deriveMotion({ tokensMd });
let gen = deepMerge(numericBase, compositeTree);
gen = deepMerge(gen, motionTree);
const numBindings = curateNumericBindings(rawBindings);
attachBindings(gen, numBindings);

// Frozen tokens.json (legacy frozen file, the comparison baseline).
const frozen = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tokens", "tokens.json"), "utf8"),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk a DTCG subtree, collecting leaf $value by dot-path.
 * Skips metadata keys ($ / _) and font.text-styles (composite — no frozen counterpart).
 */
function collectLeaves(obj, prefix) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v !== "object") continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if (p === "font.text-styles" || p.startsWith("font.text-styles.")) continue;
    if ("$value" in v) {
      result[p] = v.$value;
    } else {
      Object.assign(result, collectLeaves(v, p));
    }
  }
  return result;
}

/**
 * Normalize a token $value for comparison.
 * - Numbers coerced to string (fontWeight 400 === "400").
 * - Strings uppercased for case-insensitive hex comparison.
 */
function normalizeVal(v) {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.toUpperCase();
  return String(v);
}

// Frozen non-color sections comparable with the numerics output.
const FROZEN_SECTIONS = [
  "spacing",
  "border",
  "size",
  "breakpoint",
  "focus-ring",
  "font",
  "icon",
];

const frozenLeaves = {};
for (const section of FROZEN_SECTIONS) {
  if (frozen[section]) {
    Object.assign(frozenLeaves, collectLeaves(frozen[section], section));
  }
}

// Generated numeric leaves (flat map of all paths → $value).
const genLeaves = collectLeaves(gen, "");

// ---------------------------------------------------------------------------
// ALLOW map — each key is the full token path; the value is a one-line
// justification.  ALL entries are Bucket A (evidenced intentional diffs).
//
// Evidence summary:
//   "P1 neutral/cool-grey refresh" — the post-April ramp update ratified in
//     the P1 primitives parity gate (tokens-primitives-parity.test.js).
//   "md §N.N canonical" — the tokens.md file is the explicit authoritative
//     source for this change.
//
// Full cross-reference:
//   docs/superpowers/notes/2026-06-25-tokens-p3-parity-diffs.md
// ---------------------------------------------------------------------------
const ALLOW = {
  // --- Bucket A: P1 neutral.100 refresh downstream ---
  // tokens.md §2.4: border.default / border.disabled → --zen-color-neutral-100
  // neutral.100 was refreshed P1: actian cool-grey.100 #E4E4F0 → #C7C7CE.
  "border.default":
    "P1 neutral.100 refresh downstream: border.default→neutral-100 #E4E4F0→#C7C7CE (tokens.md §2.4 l.174)",
  "border.disabled":
    "P1 neutral.100 refresh downstream: border.disabled→neutral-100 #E4E4F0→#C7C7CE (tokens.md §2.4 l.176)",

  // --- Bucket A: P1 neutral.50 refresh downstream ---
  // tokens.md §2.4: border.subtle → --zen-color-neutral-50
  // neutral.50 was refreshed P1: actian cool-grey.50 #F5F5FA → #E1E1E6.
  "border.subtle":
    "P1 neutral.50 refresh downstream: border.subtle→neutral-50 #F5F5FA→#E1E1E6 (tokens.md §2.4 l.175)",

  // --- Bucket A: md unifies all error usages on error-600 ---
  // tokens.md §2.4 l.179: border.error → --zen-color-error-600
  // tokens.md §2.5 l.202: focus-ring.error → --zen-color-error-600
  // Frozen had error-500 (#E6492D) for both — inconsistent with text.error=error-600.
  // md canonical value: error-600 = #DC3514.
  "border.error":
    "md §2.4 canonical: border.error→error-600 #DC3514; frozen=error-500 #E6492D (tokens.md §2.4 l.179)",
  "focus-ring.error":
    "md §2.5 canonical: focus-ring.error→error-600 #DC3514; frozen=error-500 #E6492D (tokens.md §2.5 l.202)",

  // --- Bucket A: font.size.xs corrected from 10px to 11px ---
  // tokens.md §2.1 l.97: `--zen-font-size-xs | 0.6875rem (11px) | Hint | 🟢 Shipped`
  // Frozen had 10px — md canonical is 11px.
  "font.size.xs":
    "md §2.1 canonical: font-size-xs = 11px (0.6875rem); frozen had 10px (tokens.md §2.1 l.97)",
};

// ---------------------------------------------------------------------------
// Test 1: Per-leaf parity (excluding ALLOW)
// ---------------------------------------------------------------------------
test("generated numeric tokens match frozen per-leaf (ALLOW-excluded)", () => {
  const unexplained = [];

  for (const [tokenPath, fval] of Object.entries(frozenLeaves)) {
    const gval = genLeaves[tokenPath];
    if (gval === undefined) continue; // missing tokens handled in Test 3

    if (ALLOW[tokenPath]) continue; // ratified intentional diff

    const fn = normalizeVal(fval);
    const gn = normalizeVal(gval);
    if (fn !== gn) {
      unexplained.push(
        `${tokenPath}: frozen=${JSON.stringify(fval)} gen=${JSON.stringify(gval)}`,
      );
    }
  }

  assert.equal(
    unexplained.length,
    0,
    "UNEXPLAINED NUMERIC PARITY DRIFT (not in ALLOW):\n" +
      unexplained.join("\n"),
  );
});

// ---------------------------------------------------------------------------
// Test 2: ALLOW entries are all still real divergences (no stale entries)
// ---------------------------------------------------------------------------
test("ALLOW entries are all still real divergences (no stale entries)", () => {
  const stale = [];
  for (const [tokenPath, justification] of Object.entries(ALLOW)) {
    const fval = frozenLeaves[tokenPath];
    const gval = genLeaves[tokenPath];
    if (fval === undefined || gval === undefined) continue; // still a diff
    if (normalizeVal(fval) === normalizeVal(gval)) {
      stale.push(`${tokenPath}: ${justification}`);
    }
  }
  assert.equal(
    stale.length,
    0,
    "Stale ALLOW entries (now matching — remove them):\n" + stale.join("\n"),
  );
});

// ---------------------------------------------------------------------------
// Test 3: Plugin-consumed numeric tokens must not be dropped
// ---------------------------------------------------------------------------
test("plugin-consumed numeric tokens are present in generated output", () => {
  // Explicit plugin-consumed paths (from task-7-brief.md).
  const PLUGIN_CONSUMED = [
    // border radius
    "border.radius.full",
    "border.radius.md",
    "border.radius.sm",
    "border.radius.xs",
    // border width
    "border.width.md",
    "border.width.lg",
    // border semantic
    "border.default",
    "border.selected",
    // font family
    "font.family.text",
    // font size
    "font.size.xs",
    "font.size.sm",
    "font.size.md",
    "font.size.lg",
    "font.size.3xl",
    // font weight
    "font.weight.regular",
    "font.weight.medium",
    "font.weight.semibold",
    // font lineheight (all generated leaves)
    "font.lineheight.xs",
    "font.lineheight.sm",
    "font.lineheight.md",
    "font.lineheight.lg",
    "font.lineheight.xl",
    "font.lineheight.2xl",
    // font letterspacing
    "font.letterspacing.normal",
    "font.letterspacing.wide.1",
    "font.letterspacing.wide.2",
    "font.letterspacing.wide.3",
    // size (figma-only carry-forwards)
    "size.lg",
    "size.xl",
    // shadow
    "shadow.xs",
    "shadow.xl",
    // breakpoint
    "breakpoint.sm",
    "breakpoint.md",
    "breakpoint.lg",
    "breakpoint.xl",
    // spacing (all)
    "spacing.3xs",
    "spacing.2xs",
    "spacing.xs",
    "spacing.sm",
    "spacing.md",
    "spacing.lg",
    "spacing.xl",
    "spacing.2xl",
    "spacing.3xl",
    // icon
    "icon.xs",
    "icon.sm",
    "icon.md",
    "icon.lg",
  ];

  const missing = PLUGIN_CONSUMED.filter((p) => genLeaves[p] === undefined);
  assert.equal(
    missing.length,
    0,
    "Plugin-consumed numeric tokens MISSING from generated output:\n" +
      missing.join("\n"),
  );
});

// ---------------------------------------------------------------------------
// Test 4: Freshness gate — committed artifact must not be stale
// ---------------------------------------------------------------------------
test("committed numerics.tokens.json is in sync with the deriver (not stale)", () => {
  const committed = fs.readFileSync(
    path.join(ROOT, "tokens", "src", "derived", "numerics.tokens.json"),
    "utf8",
  );
  assert.equal(
    committed,
    JSON.stringify(gen, null, 2) + "\n",
    "tokens/src/derived/numerics.tokens.json is stale — re-run `node scripts/tokens/derive-tokens.js`",
  );
});
