// tests/tokens-derive-numerics.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveNumericTree } = require("../scripts/tokens/derive-tokens.js");

const MD = [
  "| `--zen-spacing-xs` | `0.5rem` (8px) | x | 🟢 Shipped |",
  "| `--zen-border-radius-sm` | `6px` | x | 🟢 Shipped |",
  "| `--zen-border-width-md` | `1px` | x | 🟢 Shipped |",
  "| `--zen-font-size-md` | `0.875rem` (14px) | x | 🟢 Shipped |",
  "| `--zen-font-weight-regular` | `400` | x | 🟢 Shipped |",
  "| `--zen-font-family-text` | `Roboto` | x | 🟢 Shipped |",
  "| `--zen-font-letterspacing-wide-1` | `0.1px` | x | 🔵 In Review |",
  "| `--zen-size-icon-md` | `20px` | x | 🟡 Proposed |",
].join("\n");

test("spacing/border/font dimensions emit px dimension leaves", () => {
  const t = deriveNumericTree({ tokensMd: MD });
  assert.deepEqual(
    { ty: t.spacing.xs.$type, v: t.spacing.xs.$value }, { ty: "dimension", v: "8px" });
  assert.equal(t.border.radius.sm.$value, "6px");
  assert.equal(t.font.size.md.$value, "14px");
});
test("weight is fontWeight number; family is fontFamily string", () => {
  const t = deriveNumericTree({ tokensMd: MD });
  assert.equal(t.font.weight.regular.$type, "fontWeight");
  assert.equal(t.font.weight.regular.$value, 400);
  assert.equal(t.font.family.text.$type, "fontFamily");
  assert.equal(t.font.family.text.$value, "Roboto");
});
test("letterspacing-wide nests; icon sizes land under top-level icon", () => {
  const t = deriveNumericTree({ tokensMd: MD });
  assert.equal(t.font.letterspacing.wide["1"].$value, "0.1px");
  assert.equal(t.icon.md.$value, "20px");
});
test("figma-only carry-forwards present (legacy size scale + brand font)", () => {
  const t = deriveNumericTree({ tokensMd: MD });
  assert.equal(t.size.lg.$value, "24px");
  assert.equal(t.size.lg.$extensions["com.actian.status"], "figma-only");
  assert.equal(t.font.family.brand.$value, "AllRpungGothic");
});
