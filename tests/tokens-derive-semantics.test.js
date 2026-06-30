// tests/tokens-derive-semantics.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveSemanticTree } = require("../scripts/tokens/derive-tokens.js");

const primitivesMd = [
  "#### Royal Blue",
  "| Shade | Token | Hex | OKLCH |",
  "| 500 | `--zen-color-royal-blue-500` | `#0F5FDC` | x |",
  "#### Blue",
  "| 500 | `--zen-color-blue-500` | `#0283BE` | x |",
  "#### Turquoise",
  "| 500 | `--zen-color-turquoise-500` | `#049B98` | x |",
  "#### Cool Grey",
  "| 800 | `--zen-color-cool-grey-800` | `#2A2A30` | x |",
  "#### Grey",
  "| 800 | `--zen-color-grey-800` | `#636363` | x |",
  "#### White & Black",
  "| `--zen-color-black` | `#000000` |",
].join("\n");

const semanticsMd = [
  "#### Text Color Tokens",
  "| Token | Resolves To | Usage | Status |",
  "| --- | --- | --- | --- |",
  "| `--zen-color-text-secondary` | `--zen-color-neutral-800` | x | 🟢 Shipped |",
].join("\n");

// theme + global-role tables, inline so the parser finds them
const tablesMd = [
  "| `--zen-color-primary` | `--zen-color-royal-blue` | 🟡 |",
  "| `--zen-color-neutral` | `--zen-color-cool-grey` | 🟡 |",
  "#### Theme Palettes",
  "| Theme | primary | neutral | Status |",
  "| --- | --- | --- | --- |",
  "| Actian | royal-blue | cool-grey | 🟢 |",
  "| Studio | blue | grey | 🟢 |",
  "| Explorer | turquoise | grey | 🟢 |",
].join("\n");

test("primary ramp leaf: alias $value + per-theme hex themes", () => {
  const tree = deriveSemanticTree({
    primitivesMd,
    semanticsMd: semanticsMd + "\n" + tablesMd,
    rawBindings: { variables: [] },
  });
  const leaf = tree.color.primary["500"];
  assert.equal(leaf.$value, "{color.primitive.royal-blue.500}");
  assert.deepEqual(leaf.$extensions["com.actian.themes"], {
    actian: "#0F5FDC",
    studio: "#0283BE",
    explorer: "#049B98",
  });
});

test("derived text.secondary aliases the Actian-resolved neutral-800 + theme hex", () => {
  const tree = deriveSemanticTree({
    primitivesMd,
    semanticsMd: semanticsMd + "\n" + tablesMd,
    rawBindings: { variables: [] },
  });
  const leaf = tree.color.text.secondary;
  assert.equal(leaf.$value, "{color.primitive.cool-grey.800}");
  assert.deepEqual(leaf.$extensions["com.actian.themes"], {
    actian: "#2A2A30",
    studio: "#636363",
    explorer: "#636363",
  });
});

test("annotation is a figma-only token", () => {
  const tree = deriveSemanticTree({
    primitivesMd,
    semanticsMd: semanticsMd + "\n" + tablesMd,
    rawBindings: { variables: [] },
  });
  assert.equal(tree.color.annotation.annotation.$value, "#D71D6D");
  assert.equal(
    tree.color.annotation.annotation.$extensions["com.actian.status"],
    "figma-only",
  );
});
