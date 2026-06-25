// tests/tokens-parse-values.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseValues } = require("../scripts/tokens/lib/parse-values.js");

const MD = [
  "#### Font Size",
  "| Token | Value | Usage | Status |",
  "| --- | --- | --- | --- |",
  "| `--zen-font-size-xs` | `0.6875rem` (11px) | Hint | 🟢 Shipped |",
  "| `--zen-font-size-md` | `0.875rem` (14px) | x | 🟢 Shipped |",
  "#### Spacing",
  "| Token | Value | Usage | Status |",
  "| `--zen-spacing-xs` | `0.5rem` (8px) | x | 🟢 Shipped |",
  "#### Radius",
  "| `--zen-border-radius-full` | `9999px` | x | 🟢 Shipped |",
  "#### Line Height",
  "| `--zen-font-lineheight-md` | `20px / 1.25rem` | x | 🟢 Shipped |",
  "#### Weight",
  "| `--zen-font-weight-regular` | `400` | x | 🟢 Shipped |",
  "#### Family",
  '| `--zen-font-family-mono` | `"Roboto Mono"` | x | 🟢 Shipped |',
  "#### Letter Spacing",
  "| `--zen-font-letterspacing-wide-1` | `0.1px` | x | 🔵 In Review |",
].join("\n");

test("extracts px from `rem (px)` form", () => {
  const out = parseValues(MD);
  assert.equal(out.find((t) => t.token === "font-size-xs").value, "11px");
  assert.equal(out.find((t) => t.token === "spacing-xs").value, "8px");
});
test("extracts px from `px / rem` form and keeps bare px", () => {
  const out = parseValues(MD);
  assert.equal(out.find((t) => t.token === "font-lineheight-md").value, "20px");
  assert.equal(
    out.find((t) => t.token === "border-radius-full").value,
    "9999px",
  );
});
test("keeps unitless numbers and unquotes families", () => {
  const out = parseValues(MD);
  assert.equal(out.find((t) => t.token === "font-weight-regular").value, "400");
  assert.equal(
    out.find((t) => t.token === "font-family-mono").value,
    "Roboto Mono",
  );
});
test("normalizes status incl In Review", () => {
  const out = parseValues(MD);
  assert.equal(
    out.find((t) => t.token === "font-letterspacing-wide-1").status,
    "In Review",
  );
});
test("skips color rows, solid composite rows, resolves-to rows, and shadow (comma) rows", () => {
  const md = [
    "| `--zen-color-primary-500` | `#3B6EE1` | x | 🟢 Shipped |",
    "| `--zen-border-default` | `1px solid --zen-color-neutral-100` | x | 🟢 Shipped |",
    "| `--zen-focus-ring-primary` | `--zen-color-primary-500` | x | 🟢 Shipped |",
    "| `--zen-shadow-md` | `0px 1px 3px 1px #0F, 0px 1px 5px 0px #12` | x | 🟢 Shipped |",
  ].join("\n");
  assert.equal(parseValues(md).length, 0);
});
