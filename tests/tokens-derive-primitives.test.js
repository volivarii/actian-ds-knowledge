// tests/tokens-derive-primitives.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { derivePrimitiveTree } = require("../scripts/tokens/derive-tokens.js");

const MD = [
  "#### Royal Blue",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 500 | `--zen-color-royal-blue-500` | `#0F5FDC` | `x` |",
].join("\n");
const RAW = { variables: [
  { name: "royal-blue/500", key: "k1", scopes: ["ALL_SCOPES"], variableType: "COLOR", variableCollectionName: "Zen colors" },
]};

test("emits DTCG color leaf with hex value + computed oklch + binding", () => {
  const tree = derivePrimitiveTree({ primitivesMd: MD, rawBindings: RAW });
  const leaf = tree.color.primitive["royal-blue"]["500"];
  assert.equal(leaf.$type, "color");
  assert.equal(leaf.$value, "#0F5FDC");
  assert.match(leaf.$extensions["com.actian.oklch"], /^oklch\(0\.52/);
  assert.deepEqual(leaf.$extensions["com.figma"], { variableKey: "k1", scopes: ["ALL_SCOPES"] });
});

test("omits com.figma when no binding matches", () => {
  const tree = derivePrimitiveTree({ primitivesMd: MD, rawBindings: { variables: [] } });
  assert.equal(tree.color.primitive["royal-blue"]["500"].$extensions["com.figma"], undefined);
});
