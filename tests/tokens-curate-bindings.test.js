"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  curatePrimitiveBindings,
  curateSemanticBindings,
  curateNumericBindings,
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

// ─── curateNumericBindings ────────────────────────────────────────────────────

const NUMERIC_RAW = {
  variables: [
    // Spacing
    {
      name: "Spacing/spacing-sm",
      key: "s1",
      scopes: ["GAP"],
      variableType: "FLOAT",
      variableCollectionName: "Spacing",
    },
    {
      name: "Spacing/spacing-xs",
      key: "s2",
      scopes: ["GAP"],
      variableType: "FLOAT",
      variableCollectionName: "Spacing",
    },
    // Borders — dimension
    {
      name: "border-radius-sm",
      key: "br1",
      scopes: [],
      variableType: "FLOAT",
      variableCollectionName: "Borders",
    },
    {
      name: "border-width-md",
      key: "bw1",
      scopes: [],
      variableType: "FLOAT",
      variableCollectionName: "Borders",
    },
    // Borders — COLOR styles (must map)
    {
      name: "border-default",
      key: "bd1",
      scopes: [],
      variableType: "COLOR",
      variableCollectionName: "Borders",
    },
    {
      name: "border-subtle",
      key: "bd2",
      scopes: [],
      variableType: "COLOR",
      variableCollectionName: "Borders",
    },
    // Borders — semantic COLOR (must skip)
    {
      name: "color-border-error",
      key: "cbe",
      scopes: [],
      variableType: "COLOR",
      variableCollectionName: "Borders",
    },
    // Height
    {
      name: "size-height-md",
      key: "h1",
      scopes: [],
      variableType: "FLOAT",
      variableCollectionName: "Height",
    },
    // Trigger area
    {
      name: "size-trigger-min",
      key: "tr1",
      scopes: [],
      variableType: "FLOAT",
      variableCollectionName: "Trigger area",
    },
    // Icon — size (must map)
    {
      name: "size-icon-md",
      key: "i1",
      scopes: [],
      variableType: "FLOAT",
      variableCollectionName: "Icon",
    },
    // Icon — color (must skip)
    {
      name: "color-icon-error",
      key: "ci1",
      scopes: [],
      variableType: "COLOR",
      variableCollectionName: "Icon",
    },
    // Focus rings
    {
      name: "focus-ring-offset",
      key: "fr1",
      scopes: [],
      variableType: "FLOAT",
      variableCollectionName: "Focus rings",
    },
    {
      name: "focus-ring-primary",
      key: "fr2",
      scopes: [],
      variableType: "COLOR",
      variableCollectionName: "Focus rings",
    },
    // Font / Text — must map
    {
      name: "font-family-text",
      key: "ff1",
      scopes: [],
      variableType: "STRING",
      variableCollectionName: "Font / Text",
    },
    {
      name: "font-size-md",
      key: "fs1",
      scopes: [],
      variableType: "FLOAT",
      variableCollectionName: "Font / Text",
    },
    {
      name: "font-weight-bold",
      key: "fw1",
      scopes: [],
      variableType: "FLOAT",
      variableCollectionName: "Font / Text",
    },
    {
      name: "font-lineheight-md",
      key: "fl1",
      scopes: [],
      variableType: "FLOAT",
      variableCollectionName: "Font / Text",
    },
    // Font / Text — must skip
    {
      name: "color-text-error",
      key: "ct1",
      scopes: [],
      variableType: "COLOR",
      variableCollectionName: "Font / Text",
    },
    {
      name: "font-letterspacing-1",
      key: "fls1",
      scopes: [],
      variableType: "FLOAT",
      variableCollectionName: "Font / Text",
    },
  ],
};

test("curateNumericBindings: Spacing/spacing-<k> → spacing.<k>", () => {
  const m = curateNumericBindings(NUMERIC_RAW);
  assert.deepEqual(m["spacing.sm"], { variableKey: "s1", scopes: ["GAP"] });
  assert.deepEqual(m["spacing.xs"], { variableKey: "s2", scopes: ["GAP"] });
});

test("curateNumericBindings: Borders dimension → border.radius.* and border.width.*", () => {
  const m = curateNumericBindings(NUMERIC_RAW);
  assert.deepEqual(m["border.radius.sm"], { variableKey: "br1", scopes: [] });
  assert.deepEqual(m["border.width.md"], { variableKey: "bw1", scopes: [] });
});

test("curateNumericBindings: border-<name> COLOR → border.<name>; color-border-* skipped", () => {
  const m = curateNumericBindings(NUMERIC_RAW);
  assert.deepEqual(m["border.default"], { variableKey: "bd1", scopes: [] });
  assert.deepEqual(m["border.subtle"], { variableKey: "bd2", scopes: [] });
  // color-border-error must not appear at all
  assert.equal(m["border.error"], undefined);
  assert.equal(
    Object.keys(m).some((k) => k.includes("color-border")),
    false,
  );
});

test("curateNumericBindings: size-height, size-trigger, icon, focus-ring", () => {
  const m = curateNumericBindings(NUMERIC_RAW);
  assert.deepEqual(m["size.height.md"], { variableKey: "h1", scopes: [] });
  assert.deepEqual(m["size.trigger.min"], { variableKey: "tr1", scopes: [] });
  assert.deepEqual(m["icon.md"], { variableKey: "i1", scopes: [] });
  assert.equal(m["icon.error"], undefined); // color-icon-* skipped
  assert.deepEqual(m["focus-ring.offset"], { variableKey: "fr1", scopes: [] });
  assert.deepEqual(m["focus-ring.primary"], { variableKey: "fr2", scopes: [] });
});

test("curateNumericBindings: Font / Text family/size/weight/lineheight mapped; color-text-* and letterspacing skipped", () => {
  const m = curateNumericBindings(NUMERIC_RAW);
  assert.deepEqual(m["font.family.text"], { variableKey: "ff1", scopes: [] });
  assert.deepEqual(m["font.size.md"], { variableKey: "fs1", scopes: [] });
  assert.deepEqual(m["font.weight.bold"], { variableKey: "fw1", scopes: [] });
  assert.deepEqual(m["font.lineheight.md"], { variableKey: "fl1", scopes: [] });
  // color-text-* and font-letterspacing-* must be absent
  assert.equal(m["font.text.error"], undefined);
  assert.equal(
    Object.keys(m).some((k) => k.includes("color-text")),
    false,
  );
  assert.equal(
    Object.keys(m).some((k) => k.includes("letterspacing")),
    false,
  );
});

// ─── curateSemanticBindings ───────────────────────────────────────────────────

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
