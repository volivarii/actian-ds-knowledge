// tests/tokens-composites.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseBorderStyles,
  parseFocusStyles,
  parseShadows,
} = require("../scripts/tokens/lib/parse-composites.js");
const { deriveCompositeStyles } = require("../scripts/tokens/derive-tokens.js");

// ─── Inline fixtures ──────────────────────────────────────────────────────────

const BORDER_MD = [
  "| `--zen-border-default`  | `1px solid --zen-color-neutral-100` | Default border for containers | 🟢 Shipped  |",
  "| `--zen-border-subtle`   | `1px solid --zen-color-neutral-50`  | Separators                    | 🟢 Shipped  |",
  "| `--zen-border-disabled` | `1px solid --zen-color-neutral-100` | Disabled state                | 🟢 Shipped  |",
  "| `--zen-border-primary`  | `1px solid --zen-color-primary-500` | Interactive elements          | 🟡 Proposed |",
  "| `--zen-border-selected` | `2px solid --zen-color-primary-500` | Selected state                | 🟡 Proposed |",
  "| `--zen-border-error`    | `1px solid --zen-color-error-600`   | Error state inputs            | 🟡 Proposed |",
  "| `--zen-border-warning`  | `1px solid --zen-color-warning-600` | Warning state                 | 🟡 Proposed |",
  "| `--zen-border-success`  | `1px solid --zen-color-success-600` | Success state                 | 🟡 Proposed |",
  "| `--zen-border-info`     | `1px solid --zen-color-primary-500` | Info state                    | 🟡 Proposed |",
  "| `--zen-border-strong`   | `1px solid --zen-color-neutral-800` | High emphasis                 | 🟡 Proposed |",
  "| `--zen-border-reverse`  | `1px solid --zen-color-white`       | Dark backgrounds              | 🟡 Proposed |",
].join("\n");

const FOCUS_MD = [
  "| `--zen-focus-ring-primary` | `2px solid --zen-color-primary-500` | Buttons | 🟢 Shipped |",
  "| `--zen-focus-ring-error`   | `2px solid --zen-color-error-600`   | Error inputs | 🟢 Shipped |",
  "| `--zen-focus-ring-offset`  | `2px` | Outlined focus states | 🟢 Shipped |",
].join("\n");

const SHADOW_MD = [
  "| `--zen-shadow-xs` | `0px 1px 3px 1px #0F, 0px 1px 5px 0px #12`  | Dropdowns | 🟢 Shipped |",
  "| `--zen-shadow-sm` | `0px 1px 7px 3px #14, 0px 1px 3px 1px #1F`  | App header | 🟢 Shipped |",
  "| `--zen-shadow-md` | `0px 1px 3px 0px #4D, 0px 4px 8px 3px #26`  | Snackbar | 🟢 Shipped |",
  "| `--zen-shadow-lg` | `0px 2px 3px 0px #4D, 0px 6px 10px 4px #26` | — | 🟢 Shipped |",
  "| `--zen-shadow-xl` | `0px 4px 4px 0px #4D, 0px 8px 12px 6px #26` | Dialogs | 🟢 Shipped |",
].join("\n");

// ─── parseBorderStyles ────────────────────────────────────────────────────────

test("parseBorderStyles: emits 11 rows", () => {
  const rows = parseBorderStyles(BORDER_MD);
  assert.equal(rows.length, 11);
});

test("parseBorderStyles: border-default row has correct fields", () => {
  const rows = parseBorderStyles(BORDER_MD);
  const d = rows.find((r) => r.name === "default");
  assert.ok(d, "default row must exist");
  assert.equal(d.width, "1px");
  assert.equal(d.color, "neutral-100");
  assert.equal(d.status, "Shipped");
});

test("parseBorderStyles: border-selected width=2px + color=primary-500", () => {
  const rows = parseBorderStyles(BORDER_MD);
  const s = rows.find((r) => r.name === "selected");
  assert.equal(s.width, "2px");
  assert.equal(s.color, "primary-500");
});

test("parseBorderStyles: border-reverse color=white (singleton)", () => {
  const rows = parseBorderStyles(BORDER_MD);
  const r = rows.find((r) => r.name === "reverse");
  assert.equal(r.color, "white");
});

test("parseBorderStyles: status mapping (Shipped/Proposed)", () => {
  const rows = parseBorderStyles(BORDER_MD);
  assert.equal(rows.find((r) => r.name === "default").status, "Shipped");
  assert.equal(rows.find((r) => r.name === "primary").status, "Proposed");
});

// ─── parseFocusStyles ─────────────────────────────────────────────────────────

test("parseFocusStyles: emits only composite rows (2, skips offset)", () => {
  const rows = parseFocusStyles(FOCUS_MD);
  assert.equal(rows.length, 2);
  assert.ok(!rows.find((r) => r.name === "offset"), "offset must be skipped");
});

test("parseFocusStyles: focus-ring-primary has width=2px + color=primary-500", () => {
  const rows = parseFocusStyles(FOCUS_MD);
  const p = rows.find((r) => r.name === "primary");
  assert.equal(p.width, "2px");
  assert.equal(p.color, "primary-500");
  assert.equal(p.status, "Shipped");
});

test("parseFocusStyles: focus-ring-error has color=error-600", () => {
  const rows = parseFocusStyles(FOCUS_MD);
  const e = rows.find((r) => r.name === "error");
  assert.equal(e.color, "error-600");
});

// ─── parseShadows ─────────────────────────────────────────────────────────────

test("parseShadows: emits 5 rows (xs..xl)", () => {
  const rows = parseShadows(SHADOW_MD);
  assert.equal(rows.length, 5);
});

test("parseShadows: shadow-xs has verbatim value + Shipped status", () => {
  const rows = parseShadows(SHADOW_MD);
  const xs = rows.find((r) => r.name === "xs");
  assert.equal(xs.value, "0px 1px 3px 1px #0F, 0px 1px 5px 0px #12");
  assert.equal(xs.status, "Shipped");
});

test("parseShadows: shadow-xl value verbatim", () => {
  const rows = parseShadows(SHADOW_MD);
  const xl = rows.find((r) => r.name === "xl");
  assert.equal(xl.value, "0px 4px 4px 0px #4D, 0px 8px 12px 6px #26");
});

// ─── deriveCompositeStyles integration ───────────────────────────────────────

// Minimal primitives fixture — only the palettes needed for the border/focus tests.
const PRIM_MD = [
  "#### Royal Blue",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 500 | `--zen-color-royal-blue-500` | `#0F5FDC` | x |",
  "#### Cool Grey",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 50  | `--zen-color-cool-grey-50`  | `#E1E1E6` | x |",
  "| 100 | `--zen-color-cool-grey-100` | `#C7C7CE` | x |",
  "| 800 | `--zen-color-cool-grey-800` | `#40404A` | x |",
  "#### Red",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 600 | `--zen-color-red-600` | `#DC3514` | x |",
  "#### Orange",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 600 | `--zen-color-orange-600` | `#EF8D00` | x |",
  "#### Green",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 600 | `--zen-color-green-600` | `#098900` | x |",
  "#### White & Black",
  "| `--zen-color-white` | `#FFFFFF` |",
].join("\n");

// Minimal tokens.md fixture — global roles + theme table only (no border rows needed for resolver).
const TOKENS_MD =
  BORDER_MD +
  "\n" +
  FOCUS_MD +
  "\n" +
  SHADOW_MD +
  "\n" +
  [
    "| `--zen-color-primary` | `--zen-color-royal-blue` | 🟡 |",
    "| `--zen-color-neutral` | `--zen-color-cool-grey`  | 🟡 |",
    "| `--zen-color-success` | `--zen-color-green`      | 🟢 |",
    "| `--zen-color-warning` | `--zen-color-orange`     | 🟢 |",
    "| `--zen-color-error`   | `--zen-color-red`        | 🟢 |",
    "#### Theme Palettes",
    "| Theme | primary | neutral | Status |",
    "| --- | --- | --- | --- |",
    "| Actian | royal-blue | cool-grey | 🟢 |",
    "| Studio | royal-blue | cool-grey | 🟢 |",
    "| Explorer | royal-blue | cool-grey | 🟢 |",
  ].join("\n");

test("deriveCompositeStyles: returns border, focus-ring, shadow keys", () => {
  const tree = deriveCompositeStyles({
    tokensMd: TOKENS_MD,
    primitivesMd: PRIM_MD,
  });
  assert.ok(tree.border, "border key must exist");
  assert.ok(tree["focus-ring"], "focus-ring key must exist");
  assert.ok(tree.shadow, "shadow key must exist");
});

test("deriveCompositeStyles: border.default leaf shape", () => {
  const tree = deriveCompositeStyles({
    tokensMd: TOKENS_MD,
    primitivesMd: PRIM_MD,
  });
  const leaf = tree.border.default;
  assert.equal(leaf.$type, "color");
  // $value = resolved Actian hex of neutral-100 (cool-grey-100 in fixture = #C7C7CE)
  assert.equal(leaf.$value, "#C7C7CE");
  // extension carries composite parts
  const ext = leaf.$extensions["com.actian.border"];
  assert.ok(ext, "com.actian.border extension must be present");
  assert.equal(ext.width, "1px");
  assert.equal(ext.style, "solid");
  assert.equal(ext.color, "{color.neutral.100}");
  assert.equal(leaf.$extensions["com.actian.status"], "Shipped");
});

test("deriveCompositeStyles: border.selected leaf shape (2px)", () => {
  const tree = deriveCompositeStyles({
    tokensMd: TOKENS_MD,
    primitivesMd: PRIM_MD,
  });
  const leaf = tree.border.selected;
  assert.equal(leaf.$type, "color");
  assert.equal(leaf.$value, "#0F5FDC");
  assert.equal(leaf.$extensions["com.actian.border"].width, "2px");
  assert.equal(
    leaf.$extensions["com.actian.border"].color,
    "{color.primary.500}",
  );
});

test("deriveCompositeStyles: focus-ring.primary leaf shape", () => {
  const tree = deriveCompositeStyles({
    tokensMd: TOKENS_MD,
    primitivesMd: PRIM_MD,
  });
  const leaf = tree["focus-ring"].primary;
  assert.equal(leaf.$type, "color");
  assert.equal(leaf.$value, "#0F5FDC");
  const ext = leaf.$extensions["com.actian.focusRing"];
  assert.ok(ext, "com.actian.focusRing extension must be present");
  assert.equal(ext.width, "2px");
  assert.equal(ext.style, "solid");
  assert.equal(ext.color, "{color.primary.500}");
  assert.equal(leaf.$extensions["com.actian.status"], "Shipped");
});

test("deriveCompositeStyles: focus-ring.error leaf shape", () => {
  const tree = deriveCompositeStyles({
    tokensMd: TOKENS_MD,
    primitivesMd: PRIM_MD,
  });
  const leaf = tree["focus-ring"].error;
  assert.equal(leaf.$value, "#DC3514");
  assert.equal(
    leaf.$extensions["com.actian.focusRing"].color,
    "{color.error.600}",
  );
});

test("deriveCompositeStyles: shadow.xs leaf shape", () => {
  const tree = deriveCompositeStyles({
    tokensMd: TOKENS_MD,
    primitivesMd: PRIM_MD,
  });
  const leaf = tree.shadow.xs;
  assert.equal(leaf.$type, "shadow");
  assert.equal(leaf.$value, "0px 1px 3px 1px #0F, 0px 1px 5px 0px #12");
  assert.equal(leaf.$extensions["com.actian.status"], "Shipped");
});

test("deriveCompositeStyles: all 5 shadows present", () => {
  const tree = deriveCompositeStyles({
    tokensMd: TOKENS_MD,
    primitivesMd: PRIM_MD,
  });
  for (const name of ["xs", "sm", "md", "lg", "xl"]) {
    assert.ok(tree.shadow[name], `shadow.${name} must exist`);
  }
});

test("deriveCompositeStyles: border.reverse $value = white #FFFFFF", () => {
  const tree = deriveCompositeStyles({
    tokensMd: TOKENS_MD,
    primitivesMd: PRIM_MD,
  });
  assert.equal(tree.border.reverse.$value, "#FFFFFF");
  assert.equal(
    tree.border.reverse.$extensions["com.actian.border"].color,
    "{color.primitive.white}",
  );
});
