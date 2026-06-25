// tests/tokens-formula-lint.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { lintShadeRamp } = require("../scripts/tokens/lib/formula-lint.js");

test("a clean ramp around its 500 base yields no warnings", () => {
  // royal-blue real shades stay close to the formula prediction
  // Uses actual royal-blue 50 (#CBE3FF) and 600 (#0053D7), which follow
  // documented formulas: 50 interpolates toward white; 600 uses
  // multiplicative darkening (L = L500 * 0.94, C = C500 * 1.05).
  const out = lintShadeRamp("royal-blue", {
    50: "#CBE3FF",
    500: "#0F5FDC",
    600: "#0053D7",
  });
  assert.equal(out.length, 0);
});

test("an off-ramp shade is flagged", () => {
  const out = lintShadeRamp("royal-blue", { 500: "#0F5FDC", 600: "#FF0000" });
  assert.ok(out.some((w) => w.shade === "600" && w.severity === "warn"));
});

test("a realistic shade confusion (one-step off) triggers the threshold", () => {
  // Using royal-blue's 500 hex as the 600 shade — a one-step confusion
  // deltaL ≈ 0.031, which exceeds THRESH (0.03) and should be flagged.
  const out = lintShadeRamp("royal-blue", {
    500: "#0F5FDC",
    600: "#0F5FDC",
  });
  assert.ok(out.some((w) => w.shade === "600" && w.severity === "warn"));
});
