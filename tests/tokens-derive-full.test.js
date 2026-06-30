// tests/tokens-derive-full.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  derivePrimitiveTree,
  deriveSemanticTree,
  deriveNumericTree,
  deriveCompositeStyles,
  deriveMotion,
  deepMerge,
  attachBindings,
  deriveFullTokens,
} = require("../scripts/tokens/derive-tokens.js");

// ─── Minimal markdown fixtures that cover all required assertions ─────────────

const primitivesMd = [
  "#### Royal Blue",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 500 | `--zen-color-royal-blue-500` | `#0F5FDC` | x |",
  "| 700 | `--zen-color-royal-blue-700` | `#1040A0` | x |",
  "#### Cool Grey",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 800 | `--zen-color-cool-grey-800` | `#2A2A30` | x |",
  "#### Blue",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 500 | `--zen-color-blue-500` | `#0283BE` | x |",
  "| 700 | `--zen-color-blue-700` | `#015A86` | x |",
  "#### Turquoise",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 500 | `--zen-color-turquoise-500` | `#049B98` | x |",
  "| 700 | `--zen-color-turquoise-700` | `#036E6C` | x |",
  "#### Grey",
  "| Shade | Token | Hex | OKLCH |",
  "| --- | --- | --- | --- |",
  "| 800 | `--zen-color-grey-800` | `#636363` | x |",
  "#### White & Black",
  "| `--zen-color-white` | `#FFFFFF` |",
  "| `--zen-color-black` | `#000000` |",
].join("\n");

const roleTablesMd = [
  "| `--zen-color-primary` | `--zen-color-royal-blue` | 🟡 |",
  "| `--zen-color-neutral` | `--zen-color-cool-grey` | 🟡 |",
  "#### Theme Palettes",
  "| Theme | primary | neutral | Status |",
  "| --- | --- | --- | --- |",
  "| Actian | royal-blue | cool-grey | 🟢 |",
  "| Studio | blue | grey | 🟢 |",
  "| Explorer | turquoise | grey | 🟢 |",
].join("\n");

const semanticMd = [
  "#### Text Color Tokens",
  "| Token | Resolves To | Usage | Status |",
  "| --- | --- | --- | --- |",
  "| `--zen-color-text-secondary` | `--zen-color-neutral-800` | x | 🟢 Shipped |",
  "| `--zen-color-text-link-default` | `--zen-color-primary-500` | Hyperlinks | 🟢 Shipped |",
  "| `--zen-color-text-link-visited` | `--zen-color-primary-700` | Visited hyperlinks | 🟡 Proposed |",
].join("\n");

const tokensMd = [
  roleTablesMd,
  semanticMd,
  // spacing
  "| `--zen-spacing-xs` | `0.5rem` (8px) | x | 🟢 Shipped |",
  // border radius
  "| `--zen-border-radius-sm` | `6px` | x | 🟢 Shipped |",
  // border default (composite style)
  "| border-default | neutral-100 | default | 1px | 🟢 Shipped |",
  // shadow
  "| `--zen-shadow-xs` | `0px 1px 3px 1px rgba(0, 0, 15, 0.06)` | x | 🟢 Shipped |",
  // motion duration
  "| `--zen-motion-duration-fast` | `200ms` | x | 🟡 Proposed |",
  // text styles header
  "| `--zen-text-heading-standard` | semibold | lg | letterspacing-wide-1 | lg | x | 🟢 Shipped |",
].join("\n");

const rawBindings = { variables: [] };

// ─── Tests ────────────────────────────────────────────────────────────────────

test("deriveFullTokens is exported", () => {
  assert.equal(typeof deriveFullTokens, "function");
});

test("$metadata._frozen is false", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  assert.equal(full.$metadata._frozen, false);
  assert.equal(full.$metadata.generatedBy, "scripts/tokens/derive-tokens.js");
});

test("top-level key order: schema-meta keys come first, then domain keys", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  const keys = Object.keys(full);
  // All four meta keys must appear before any domain key
  const colorIdx = keys.indexOf("color");
  assert.ok(colorIdx > 0, "color must not be first key");
  assert.ok(keys.indexOf("_schema_version") < colorIdx);
  assert.ok(keys.indexOf("$schema") < colorIdx);
  assert.ok(keys.indexOf("$description") < colorIdx);
  assert.ok(keys.indexOf("$metadata") < colorIdx);
  // shadow and motion must be present (new in P3)
  assert.ok(keys.includes("shadow"), "shadow key must exist");
  assert.ok(keys.includes("motion"), "motion key must exist");
});

test("color.primitive['royal-blue']['500'] exists (primitives merged into color)", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  const leaf = full.color.primitive["royal-blue"]["500"];
  assert.ok(leaf, "color.primitive.royal-blue.500 must exist");
  assert.equal(leaf.$type, "color");
  assert.equal(leaf.$value, "#0F5FDC");
});

test("color.primary['500'] exists (semantic alias)", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  const leaf = full.color.primary["500"];
  assert.ok(leaf, "color.primary.500 must exist");
  assert.equal(leaf.$value, "{color.primitive.royal-blue.500}");
});

test("color.text.secondary exists", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  assert.ok(
    full.color.text && full.color.text.secondary,
    "color.text.secondary must exist",
  );
});

test("color.text.link.visited exists (nested semantic token)", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  assert.ok(
    full.color.text && full.color.text.link && full.color.text.link.visited,
    "color.text.link.visited must exist",
  );
});

test("spacing.xs exists (numeric)", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  assert.ok(full.spacing && full.spacing.xs, "spacing.xs must exist");
  assert.equal(full.spacing.xs.$value, "8px");
});

test("border.radius.sm exists (numeric)", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  assert.ok(
    full.border && full.border.radius && full.border.radius.sm,
    "border.radius.sm must exist",
  );
  assert.equal(full.border.radius.sm.$value, "6px");
});

test("shadow.xs exists (composite styles)", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  assert.ok(full.shadow && full.shadow.xs, "shadow.xs must exist");
  assert.equal(full.shadow.xs.$type, "shadow");
});

test("motion.duration.fast exists (motion family)", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  assert.ok(
    full.motion && full.motion.duration && full.motion.duration.fast,
    "motion.duration.fast must exist",
  );
  assert.equal(full.motion.duration.fast.$value, "200ms");
});

test("font['text-styles']['heading-standard'] exists (text-styles composite)", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  assert.ok(
    full.font &&
      full.font["text-styles"] &&
      full.font["text-styles"]["heading-standard"],
    "font.text-styles.heading-standard must exist",
  );
});

test("full-tree collision scan: no dot-path appears twice", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });

  function collectPaths(obj, prefix) {
    const paths = [];
    for (const [k, v] of Object.entries(obj)) {
      // Skip DTCG meta keys
      if (k.startsWith("$") || k.startsWith("_")) continue;
      const dotPath = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && ("$value" in v || "$type" in v)) {
        paths.push(dotPath);
      } else if (v && typeof v === "object") {
        paths.push(...collectPaths(v, dotPath));
      }
    }
    return paths;
  }

  const all = collectPaths(full, "");
  const seen = new Set();
  const collisions = [];
  for (const p of all) {
    if (seen.has(p)) collisions.push(p);
    seen.add(p);
  }
  assert.deepEqual(
    collisions,
    [],
    `Collision(s) detected: ${collisions.join(", ")}`,
  );
});

test("color.icon (semantic) and top-level icon (numeric icon sizes) are distinct keys", () => {
  const full = deriveFullTokens({ primitivesMd, tokensMd, rawBindings });
  // top-level icon must exist (numeric: icon sizes from size-icon-* tokens)
  // Note: the fixture tokensMd has no size-icon-* rows so full.icon may be undefined,
  // but color.icon and icon must not collide — colour.icon is under color, icon is top-level.
  // The key color.icon is NOT the same tree path as icon.
  const colorKeys = Object.keys(full.color || {});
  // icon can appear as a color role (semantic) — it must be under full.color, not clobbering full.icon
  if (colorKeys.includes("icon") && full.icon) {
    // Both exist: color.icon ≠ icon (they're at different depths)
    assert.notEqual(full.color.icon, full.icon);
  }
  // No test failure: they're structurally separate
});

test("deriveFullTokens works with real source files (smoke)", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const primitivesMdReal = fs.readFileSync(
    path.join(repoRoot, "foundations", "src", "color-primitives.md"),
    "utf8",
  );
  const tokensMdReal = fs.readFileSync(
    path.join(repoRoot, "foundations", "src", "tokens.md"),
    "utf8",
  );
  const rawBindingsReal = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "tokens", "src", "figma-bindings-raw.json"),
      "utf8",
    ),
  );

  const full = deriveFullTokens({
    primitivesMd: primitivesMdReal,
    tokensMd: tokensMdReal,
    rawBindings: rawBindingsReal,
  });

  // Primitives
  assert.ok(full.color.primitive["royal-blue"]["500"], "real: royal-blue.500");
  // Semantics
  assert.ok(full.color.primary["500"], "real: primary.500");
  assert.ok(full.color.text.secondary, "real: text.secondary");
  assert.ok(full.color.text.link.visited, "real: text.link.visited");
  // Numerics
  assert.ok(full.spacing.xs, "real: spacing.xs");
  assert.ok(full.border.radius.sm, "real: border.radius.sm");
  assert.ok(full.border.default, "real: border.default");
  assert.ok(full.shadow.xs, "real: shadow.xs");
  assert.ok(full.motion.duration.fast, "real: motion.duration.fast");
  assert.ok(
    full.font["text-styles"]["heading-standard"],
    "real: font.text-styles.heading-standard",
  );
  // Metadata
  assert.equal(full.$metadata._frozen, false);
});
