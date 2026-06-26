// tests/tokens-text-styles.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTextStyles, buildTextStyle } = require("../scripts/tokens/lib/parse-text-styles.js");

const MD = [
  "| Token | Weight | Size | Letter Spacing | Line Height | Usage | Status |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  "| `--zen-text-heading-standard` | semibold | lg | letterspacing-wide-1 | lg | Section header | 🟢 Shipped |",
  "| `--zen-text-body-display` | regular | xl | letterspacing-wide-1 | lg | Support | 🟢 Shipped |",
].join("\n");

test("parses composite rows into named style specs", () => {
  const out = parseTextStyles(MD);
  assert.deepEqual(out.find((s) => s.name === "heading-standard"), {
    name: "heading-standard", weight: "semibold", size: "lg",
    letterspacing: "wide-1", lineheight: "lg", status: "Shipped",
  });
});
test("buildTextStyle emits a DTCG typography composite with references", () => {
  const s = { name: "heading-standard", weight: "semibold", size: "lg", letterspacing: "wide-1", lineheight: "lg", status: "Shipped" };
  const leaf = buildTextStyle(s);
  assert.equal(leaf.$type, "typography");
  assert.deepEqual(leaf.$value, {
    fontWeight: "{font.weight.semibold}",
    fontSize: "{font.size.lg}",
    letterSpacing: "{font.letterspacing.wide.1}",
    lineHeight: "{font.lineheight.lg}",
  });
});
