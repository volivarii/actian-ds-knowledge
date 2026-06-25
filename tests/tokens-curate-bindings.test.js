"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  curatePrimitiveBindings,
  curateSemanticBindings,
} = require("../scripts/tokens/lib/curate-bindings.js");

const RAW = {
  variables: [
    {
      name: "royal-blue/500",
      key: "k1",
      scopes: ["ALL_SCOPES"],
      variableType: "COLOR",
      variableCollectionName: "Zen colors",
    },
    {
      name: "white",
      key: "k2",
      scopes: ["ALL_SCOPES"],
      variableType: "COLOR",
      variableCollectionName: "Zen colors",
    },
    {
      name: "warm-grey/50",
      key: "k3",
      scopes: ["ALL_SCOPES"],
      variableType: "COLOR",
      variableCollectionName: "Zen colors",
    },
    {
      name: "Spacing/spacing-sm",
      key: "k4",
      scopes: ["GAP"],
      variableType: "FLOAT",
      variableCollectionName: "Spacing",
    },
  ],
};

test("maps Zen color shades to color.primitive.<palette>.<shade>", () => {
  const m = curatePrimitiveBindings(RAW);
  assert.deepEqual(m["color.primitive.royal-blue.500"], {
    variableKey: "k1",
    scopes: ["ALL_SCOPES"],
  });
});

test("maps singletons to color.primitive.<palette>", () => {
  const m = curatePrimitiveBindings(RAW);
  assert.equal(m["color.primitive.white"].variableKey, "k2");
});

test("excludes warm-grey and non-Zen collections", () => {
  const m = curatePrimitiveBindings(RAW);
  assert.equal(m["color.primitive.warm-grey.50"], undefined);
  assert.equal(
    Object.keys(m).some((k) => k.includes("spacing")),
    false,
  );
});

test("curateSemanticBindings maps Global colors primary/500 → color.primary.500", () => {
  const raw = {
    variables: [
      {
        name: "primary/500",
        key: "g1",
        scopes: ["ALL_SCOPES"],
        variableType: "COLOR",
        variableCollectionName: "Global colors",
      },
      {
        name: "neutral/800",
        key: "g2",
        scopes: ["TEXT_FILL"],
        variableType: "COLOR",
        variableCollectionName: "Global colors",
      },
      {
        name: "royal-blue/500",
        key: "z1",
        scopes: [],
        variableType: "COLOR",
        variableCollectionName: "Zen colors",
      },
    ],
  };
  const m = curateSemanticBindings(raw);
  assert.deepEqual(m["color.primary.500"], {
    variableKey: "g1",
    scopes: ["ALL_SCOPES"],
  });
  assert.deepEqual(m["color.neutral.800"], {
    variableKey: "g2",
    scopes: ["TEXT_FILL"],
  });
  assert.equal(
    Object.keys(m).some((k) => k.includes("royal-blue")),
    false,
  ); // Zen colors excluded here
});
