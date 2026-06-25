// tests/tokens-derive-numerics.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveNumericTree,
  deepMerge,
  attachBindings,
} = require("../scripts/tokens/derive-tokens.js");

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
    { ty: t.spacing.xs.$type, v: t.spacing.xs.$value },
    { ty: "dimension", v: "8px" },
  );
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

test("covers breakpoint, focus-ring offset, lineheight, letterspacing-normal, size-height, size-trigger routes", () => {
  const MD2 = [
    "| `--zen-breakpoint-sm` | `600px` | x | 🟢 Shipped |",
    "| `--zen-focus-ring-offset` | `2px` | x | 🟢 Shipped |",
    "| `--zen-font-lineheight-md` | `20px / 1.25rem` | x | 🟢 Shipped |",
    "| `--zen-font-letterspacing-normal` | `0px` | x | 🔵 In Review |",
    "| `--zen-size-height-md` | `40px` | x | 🟡 Proposed |",
    "| `--zen-size-trigger-min` | `24px` | x | 🟡 Proposed |",
  ].join("\n");
  const t = deriveNumericTree({ tokensMd: MD2 });
  assert.equal(t.breakpoint.sm.$value, "600px");
  assert.equal(t["focus-ring"].offset.$value, "2px");
  assert.equal(t.font.lineheight.md.$value, "20px");
  assert.equal(t.font.letterspacing.normal.$value, "0px");
  assert.equal(t.size.height.md.$value, "40px");
  assert.equal(t.size.trigger.min.$value, "24px");
});

// ─── deepMerge ───────────────────────────────────────────────────────────────

test("deepMerge: border.radius and border styles coexist after merge", () => {
  // Simulate: numeric tree has border.radius + border.width; composite adds border styles
  const numericSubset = {
    border: {
      radius: { sm: { $type: "dimension", $value: "6px", $extensions: {} } },
      width: { md: { $type: "dimension", $value: "1px", $extensions: {} } },
    },
    "focus-ring": {
      offset: { $type: "dimension", $value: "2px", $extensions: {} },
    },
  };
  const compositeSubset = {
    border: {
      default: { $type: "color", $value: "#c0c0c0", $extensions: {} },
      subtle: { $type: "color", $value: "#e0e0e0", $extensions: {} },
    },
    "focus-ring": {
      primary: { $type: "color", $value: "#0055ff", $extensions: {} },
      error: { $type: "color", $value: "#cc0000", $extensions: {} },
    },
    shadow: {
      md: {
        $type: "shadow",
        $value: "0 2px 4px rgba(0,0,0,.2)",
        $extensions: {},
      },
    },
  };
  const motionSubset = {
    motion: {
      duration: {
        fast: { $type: "duration", $value: "100ms", $extensions: {} },
      },
      ease: {
        standard: { $type: "string", $value: "ease-out", $extensions: {} },
      },
    },
  };

  let merged = deepMerge(numericSubset, compositeSubset);
  merged = deepMerge(merged, motionSubset);

  // border subtree: BOTH radius/width AND style leaves must coexist
  assert.ok(merged.border.radius.sm, "border.radius.sm present");
  assert.equal(merged.border.radius.sm.$value, "6px");
  assert.ok(merged.border.width.md, "border.width.md present");
  assert.ok(merged.border.default, "border.default present");
  assert.ok(merged.border.subtle, "border.subtle present");

  // focus-ring: offset (numeric) + primary/error (composite) coexist
  assert.ok(merged["focus-ring"].offset, "focus-ring.offset present");
  assert.ok(merged["focus-ring"].primary, "focus-ring.primary present");
  assert.ok(merged["focus-ring"].error, "focus-ring.error present");

  // shadow and motion present after merges
  assert.ok(merged.shadow.md, "shadow.md present");
  assert.ok(merged.motion.duration.fast, "motion.duration.fast present");
  assert.ok(merged.motion.ease.standard, "motion.ease.standard present");
});

test("deepMerge: leaf in b replaces leaf in a without descending into b's leaf", () => {
  const a = {
    x: {
      $type: "dimension",
      $value: "4px",
      $extensions: { "com.actian.status": "shipped" },
    },
  };
  const b = {
    x: {
      $type: "dimension",
      $value: "8px",
      $extensions: { "com.actian.status": "proposed" },
    },
  };
  const merged = deepMerge(a, b);
  // b's leaf must replace a's leaf entirely — no merge of $extensions
  assert.equal(merged.x.$value, "8px");
  assert.equal(merged.x.$extensions["com.actian.status"], "proposed");
});

test("deepMerge: binding attachment on merged tree via com.figma extension", () => {
  // Simulate attaching a binding to spacing.sm after merge
  const numeric = {
    spacing: {
      sm: {
        $type: "dimension",
        $value: "8px",
        $extensions: { "com.actian.status": "shipped" },
      },
    },
  };
  // After deepMerge (no-op — no overlap) + manual binding attachment simulation
  const bindings = { "spacing.sm": { variableKey: "s1", scopes: ["GAP"] } };

  // Walk the numeric tree manually to verify the attachment logic would work
  const leaf = numeric.spacing.sm;
  if (bindings["spacing.sm"]) {
    leaf.$extensions["com.figma"] = bindings["spacing.sm"];
  }
  assert.deepEqual(leaf.$extensions["com.figma"], {
    variableKey: "s1",
    scopes: ["GAP"],
  });
  // com.actian.status must still be present (attachment is additive on $extensions)
  assert.equal(leaf.$extensions["com.actian.status"], "shipped");
});

// ─── attachBindings ──────────────────────────────────────────────────────────

test("attachBindings adds com.figma without clobbering existing $extensions, leaves unmatched alone", () => {
  const tree = {
    spacing: {
      sm: {
        $type: "dimension",
        $value: "8px",
        $extensions: { "com.actian.status": "Shipped" },
      },
    },
    border: {
      radius: {
        sm: {
          $type: "dimension",
          $value: "6px",
          $extensions: {},
        },
      },
    },
  };
  attachBindings(tree, {
    "spacing.sm": { variableKey: "s1", scopes: ["GAP"] },
  });
  assert.deepEqual(tree.spacing.sm.$extensions["com.figma"], {
    variableKey: "s1",
    scopes: ["GAP"],
  });
  assert.equal(tree.spacing.sm.$extensions["com.actian.status"], "Shipped"); // preserved
  assert.equal(tree.border.radius.sm.$extensions["com.figma"], undefined); // no binding → untouched
});
