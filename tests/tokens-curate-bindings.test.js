"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { curatePrimitiveBindings } = require("../scripts/tokens/lib/curate-bindings.js");

const RAW = {
  variables: [
    { name: "royal-blue/500", key: "k1", scopes: ["ALL_SCOPES"], variableType: "COLOR", variableCollectionName: "Zen colors" },
    { name: "white", key: "k2", scopes: ["ALL_SCOPES"], variableType: "COLOR", variableCollectionName: "Zen colors" },
    { name: "warm-grey/50", key: "k3", scopes: ["ALL_SCOPES"], variableType: "COLOR", variableCollectionName: "Zen colors" },
    { name: "Spacing/spacing-sm", key: "k4", scopes: ["GAP"], variableType: "FLOAT", variableCollectionName: "Spacing" },
  ],
};

test("maps Zen color shades to color.primitive.<palette>.<shade>", () => {
  const m = curatePrimitiveBindings(RAW);
  assert.deepEqual(m["color.primitive.royal-blue.500"], { variableKey: "k1", scopes: ["ALL_SCOPES"] });
});

test("maps singletons to color.primitive.<palette>", () => {
  const m = curatePrimitiveBindings(RAW);
  assert.equal(m["color.primitive.white"].variableKey, "k2");
});

test("excludes warm-grey and non-Zen collections", () => {
  const m = curatePrimitiveBindings(RAW);
  assert.equal(m["color.primitive.warm-grey.50"], undefined);
  assert.equal(Object.keys(m).some((k) => k.includes("spacing")), false);
});
