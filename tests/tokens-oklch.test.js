"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { hexToOklch, formatOklch } = require("../scripts/tokens/lib/oklch.js");

const close = (a, b, eps) => Math.abs(a - b) <= eps;

test("white → oklch(1 0 0)", () => {
  const { L, C } = hexToOklch("#FFFFFF");
  assert.ok(close(L, 1, 0.002), `L=${L}`);
  assert.ok(close(C, 0, 0.002), `C=${C}`);
});

test("black → L≈0", () => {
  const { L, C } = hexToOklch("#000000");
  assert.ok(close(L, 0, 0.002), `L=${L}`);
  assert.ok(close(C, 0, 0.002), `C=${C}`);
});

test("royal-blue-500 #0F5FDC ≈ oklch(0.5216 0.2044 260.3)", () => {
  const { L, C, H } = hexToOklch("#0F5FDC");
  assert.ok(close(L, 0.5216, 0.01), `L=${L}`);
  assert.ok(close(C, 0.2044, 0.01), `C=${C}`);
  assert.ok(close(H, 260.3, 1.0), `H=${H}`);
});

test("formatOklch rounds L/C to 4, H to 1 decimal", () => {
  assert.equal(formatOklch({ L: 0.52163, C: 0.20441, H: 260.31 }), "oklch(0.5216 0.2044 260.3)");
});

test("accepts 3-digit hex", () => {
  const a = hexToOklch("#fff");
  assert.ok(close(a.L, 1, 0.002));
});
