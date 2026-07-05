"use strict";

// Guards that the frozen token snapshot's ACTIAN color.primary ramp stays equal
// to canonical foundations royal-blue (foundations/src/tokens.md §2.1:
// --zen-color-primary -> --zen-color-royal-blue). Runs against LIVE files, so it
// doubles as drift detection. Auto-skips 🟡-Proposed canonical shades (unshipped).
// Scope: actian theme, shipped shades only. studio/explorer/neutral are out of scope.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const tokens = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "tokens/tokens.json"), "utf8"),
);
const royalBlue = JSON.parse(
  fs.readFileSync(
    path.join(
      REPO_ROOT,
      "foundations/dist/color-primitives/primitives/royal-blue.json",
    ),
    "utf8",
  ),
);

// Build { shade -> canonical hex } from the primitive table, skipping 🟡-Proposed rows.
function canonicalRoyalBlue() {
  const map = {};
  const block = royalBlue.blocks[0];
  assert.ok(
    block && block.type === "table" && Array.isArray(block.rows),
    "royal-blue.json blocks[0] must be the color table — dist structure changed?",
  );
  for (const row of block.rows) {
    const rawHex = row["Hex (Figma)"];
    if (rawHex.includes("🟡")) continue; // Proposed / unshipped — not guarded yet
    const shade = row.Shade.replace(/\*/g, "").trim(); // "**500**" -> "500"
    const hex = rawHex.replace(/[`*]/g, "").trim().toUpperCase(); // "**`#0F5FDC`**" -> "#0F5FDC"
    map[shade] = hex;
  }
  return map;
}

test("actian color.primary ramp == canonical royal-blue (shipped shades)", () => {
  const canonical = canonicalRoyalBlue();
  const shades = Object.keys(canonical);
  assert.ok(
    shades.length >= 9,
    `expected >=9 shipped shades, got ${shades.length}`,
  );
  for (const [shade, expected] of Object.entries(canonical)) {
    const entry = tokens.color.primary[shade];
    assert.ok(entry, `tokens.json color.primary.${shade} is missing`);
    const actian = entry.$extensions["com.actian.themes"].actian.toUpperCase();
    const msg =
      `color.primary.${shade} = ${actian} but canonical royal-blue is ${expected}. ` +
      `tokens.json is a frozen snapshot — sync the actian primary ramp to ` +
      `foundations/dist/color-primitives/primitives/royal-blue.json (§2.1: primary = royal-blue).`;
    // Guard the actian-resolved hex (correct pre-flip AND post-flip when $value becomes {alias}).
    // The redundant $value == hex assertion is intentionally omitted: post-flip $value is an
    // alias reference, not the hex, so asserting $value == canonical hex would break.
    assert.equal(actian, expected, msg);
  }
});

// Tokens resolving to non-500 shades (bg.selected -> 50) are covered by the
// ramp test above; this test guards only the -500-resolving tokens.
test("semantic tokens resolving to primary == canonical royal-blue-500", () => {
  const expected = canonicalRoyalBlue()["500"]; // #0F5FDC
  const checks = [
    ["color.bg.emphasis", tokens.color.bg.emphasis],
    ["color.icon.primary", tokens.color.icon.primary],
    ["color.text.primary", tokens.color.text.primary],
    ["border.selected", tokens.border.selected],
    ["focus-ring.primary", tokens["focus-ring"].primary],
  ];
  for (const [name, entry] of checks) {
    assert.ok(entry, `tokens.json ${name} is missing`);
    // Composite tokens (border.*, focus-ring.*) carry a direct hex $value but no
    // com.actian.themes extension; semantic color tokens have the extension. Fall
    // back to $value for those so the guard works for both token shapes.
    const actian = (
      entry.$extensions?.["com.actian.themes"]?.actian ?? entry.$value
    ).toUpperCase();
    assert.equal(
      actian,
      expected,
      `${name} = ${actian} but should equal canonical royal-blue-500 (${expected}).`,
    );
  }
});
