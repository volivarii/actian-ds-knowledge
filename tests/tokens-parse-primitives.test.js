// tests/tokens-parse-primitives.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parsePrimitives,
} = require("../scripts/tokens/lib/parse-primitives.js");

const MD = [
  "#### White & Black",
  "",
  "| Token | Value | Status |",
  "| --- | --- | --- |",
  "| `--zen-color-white` | `oklch(1 0 0)` / `#FFFFFF` | 🟢 Shipped |",
  "| `--zen-color-black` | `oklch(0 0 0)` / `#000000` | 🟢 Shipped |",
  "",
  "#### Royal Blue",
  "",
  "OKLCH 500 base: `oklch(0.5216 0.2044 260.3)` — *Actian theme primary*",
  "",
  "| Shade | Token | Hex (Figma) | OKLCH (Eng) |",
  "| --- | --- | --- | --- |",
  "| 25 | `--zen-color-royal-blue-25` | `#F3F5F9` 🟡 | `oklch(0.97 0.005 260.3)` 🟡 |",
  "| **500** | **`--zen-color-royal-blue-500`** | **`#0F5FDC`** | **`oklch(0.5216 0.2044 260.3)`** |",
  "",
  "#### Warm Grey",
  "",
  "| Shade | Token | Hex (Figma) | OKLCH (Eng) |",
  "| --- | --- | --- | --- |",
  "| 50 | `--zen-color-warm-grey-50` | `#EEEEEC` | `oklch(0.9 0 90)` |",
].join("\n");

test("parses white/black singletons (shade null)", () => {
  const out = parsePrimitives(MD);
  const white = out.find((t) => t.palette === "white");
  assert.deepEqual(white, { palette: "white", shade: null, hex: "#FFFFFF" });
  assert.ok(out.find((t) => t.palette === "black" && t.hex === "#000000"));
});

test("parses shaded rows, stripping bold + status emoji", () => {
  const out = parsePrimitives(MD);
  assert.ok(
    out.find(
      (t) =>
        t.palette === "royal-blue" && t.shade === "25" && t.hex === "#F3F5F9",
    ),
  );
  assert.ok(
    out.find(
      (t) =>
        t.palette === "royal-blue" && t.shade === "500" && t.hex === "#0F5FDC",
    ),
  );
});

test("excludes warm-grey (reconciliation allowlist)", () => {
  const out = parsePrimitives(MD);
  assert.equal(
    out.find((t) => t.palette === "warm-grey"),
    undefined,
  );
});

test("throws on malformed hex", () => {
  const bad = "| 50 | `--zen-color-green-50` | `#ZZZ` | `x` |";
  assert.throws(() =>
    parsePrimitives("#### Green\n| Shade | Token | Hex | OKLCH |\n" + bad),
  );
});

test("multi-hyphen palette names extract fully (regex regression guard)", () => {
  const md = [
    "#### Singapore Orchid Purple",
    "| Shade | Token | Hex | OKLCH |",
    "| --- | --- | --- | --- |",
    "| 500 | `--zen-color-singapore-orchid-purple-500` | `#9321ED` | `x` |",
  ].join("\n");
  const out = parsePrimitives(md);
  assert.ok(
    out.find(
      (t) =>
        t.palette === "singapore-orchid-purple" &&
        t.shade === "500" &&
        t.hex === "#9321ED",
    ),
    "full hyphenated palette name must be captured, not split",
  );
});
