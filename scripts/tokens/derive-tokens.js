// scripts/tokens/derive-tokens.js
"use strict";
const fs = require("fs");
const path = require("path");
const { parsePrimitives } = require("./lib/parse-primitives.js");
const { hexToOklch, formatOklch } = require("./lib/oklch.js");
const {
  curatePrimitiveBindings,
  curateSemanticBindings,
  curateNumericBindings,
} = require("./lib/curate-bindings.js");
const { parseGlobalRoles, parseThemes } = require("./lib/parse-themes.js");
const { parseSemantics } = require("./lib/parse-semantics.js");
const { buildResolver, applyAlpha } = require("./lib/resolve.js");
const { lintShadeRamp } = require("./lib/formula-lint.js");
const { parseValues } = require("./lib/parse-values.js");
const {
  parseTextStyles,
  buildTextStyle,
} = require("./lib/parse-text-styles.js");
const {
  parseBorderStyles,
  parseFocusStyles,
  parseShadows,
} = require("./lib/parse-composites.js");
const { parseMotion } = require("./lib/parse-motion.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const THEMES = ["actian", "studio", "explorer"];
const RAMP_ROLES = ["primary", "neutral", "success", "warning", "error"];
const SHADES = [
  "25",
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
];

function derivePrimitiveTree({ primitivesMd, rawBindings }) {
  const prims = parsePrimitives(primitivesMd);
  const bindings = curatePrimitiveBindings(rawBindings);
  const tree = { color: { primitive: {} } };
  for (const { palette, shade, hex } of prims) {
    const ext = { "com.actian.oklch": formatOklch(hexToOklch(hex)) };
    const tokenPath = shade
      ? `color.primitive.${palette}.${shade}`
      : `color.primitive.${palette}`;
    if (bindings[tokenPath]) ext["com.figma"] = bindings[tokenPath];
    const leaf = { $type: "color", $value: hex, $extensions: ext };
    const palObj = (tree.color.primitive[palette] =
      tree.color.primitive[palette] || {});
    if (shade) palObj[shade] = leaf;
    else tree.color.primitive[palette] = leaf;
  }
  return tree;
}

function themesHex(resolveHex, ref, opacity) {
  const out = {};
  for (const th of THEMES) out[th] = applyAlpha(resolveHex(ref, th), opacity);
  return out;
}

function semLeaf(value, bindings, tokenPath, themes) {
  const ext = {};
  if (bindings[tokenPath]) ext["com.figma"] = bindings[tokenPath];
  ext["com.actian.themes"] = themes;
  return { $type: "color", $value: value, $extensions: ext };
}

function deriveSemanticTree({ primitivesMd, semanticsMd, rawBindings }) {
  // primitivesMd = color-primitives.md (primitive palette tables only).
  // semanticsMd  = tokens.md (global-role alias rows, theme palette table, resolves-to tables).
  const primitiveTree = derivePrimitiveTree({ primitivesMd, rawBindings });
  const globalRoles = parseGlobalRoles(semanticsMd);
  const themes = parseThemes(semanticsMd);
  const R = buildResolver({ primitiveTree, globalRoles, themes });
  const semBindings = curateSemanticBindings(rawBindings);
  const tree = { color: {} };

  // 1) Ramp roles → 11 shades, alias to the Actian palette, themes resolved.
  for (const role of RAMP_ROLES) {
    const actianPalette =
      (themes.actian && themes.actian[role]) || globalRoles[role];
    if (!actianPalette) continue;
    tree.color[role] = {};
    for (const shade of SHADES) {
      if (
        !primitiveTree.color.primitive[actianPalette] ||
        !primitiveTree.color.primitive[actianPalette][shade]
      )
        continue;
      const ref = `${role}-${shade}`;
      const tokenPath = `color.${role}.${shade}`;
      tree.color[role][shade] = semLeaf(
        `{color.primitive.${actianPalette}.${shade}}`,
        semBindings,
        tokenPath,
        themesHex(R.resolveHex, ref, null),
      );
    }
  }

  // 2) Derived groups text/bg/icon from resolves-to tables.
  for (const s of parseSemantics(semanticsMd)) {
    const grp = (tree.color[s.group] = tree.color[s.group] || {});
    // Actian alias target: resolve the ref's Actian palette+shade for the $value alias.
    const m = s.resolvesTo.match(/^(.+)-(\d{2,3})$/);
    let aliasTarget;
    if (m) {
      const actianPalette =
        (themes.actian && themes.actian[m[1]]) || globalRoles[m[1]] || m[1];
      aliasTarget = `{color.primitive.${actianPalette}.${m[2]}}`;
    } else {
      aliasTarget = `{color.primitive.${s.resolvesTo}}`; // singleton (black/white)
    }
    const value =
      s.opacity != null
        ? applyAlpha(R.resolveHex(s.resolvesTo, "actian"), s.opacity)
        : aliasTarget;
    const tokenPath = `color.${s.group}.${s.name}`;
    const node = semLeaf(
      value,
      semBindings,
      tokenPath,
      themesHex(R.resolveHex, s.resolvesTo, s.opacity),
    );
    // place possibly-nested leaf (e.g. link.default)
    const segs = s.name.split(".");
    let cur = grp;
    for (let i = 0; i < segs.length - 1; i++)
      cur = cur[segs[i]] = cur[segs[i]] || {};
    cur[segs[segs.length - 1]] = node;
  }

  // 3) annotation — figma-only carry-forward.
  tree.color.annotation = {
    annotation: {
      $type: "color",
      $value: "#D71D6D",
      $extensions: {
        "com.actian.status": "figma-only",
        "com.actian.themes": {
          actian: "#D71D6D",
          studio: "#D71D6D",
          explorer: "#D71D6D",
        },
      },
    },
  };

  return tree;
}

// ─── P3: Numeric/dimension families assembler ────────────────────────────────

const FIGMA_ONLY_SIZE = {
  sx: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  "2xl": "40px",
  "3xl": "44px",
};

/** Place a leaf at a dot-separated path inside tree (mutates tree). */
function setPath(tree, dotted, leaf) {
  const segs = dotted.split(".");
  let cur = tree;
  for (let i = 0; i < segs.length - 1; i++)
    cur = cur[segs[i]] = cur[segs[i]] || {};
  cur[segs[segs.length - 1]] = leaf;
}

/**
 * Route a parsed token name+value to a DTCG dot-path + $type.
 * Returns { dotPath, $type, $value } or null if unrecognised.
 */
function routeToken(token, rawValue) {
  // spacing-<k> → spacing.<k> · dimension
  let m = token.match(/^spacing-(.+)$/);
  if (m)
    return { dotPath: `spacing.${m[1]}`, $type: "dimension", $value: rawValue };

  // border-radius-<k> → border.radius.<k> · dimension
  m = token.match(/^border-radius-(.+)$/);
  if (m)
    return {
      dotPath: `border.radius.${m[1]}`,
      $type: "dimension",
      $value: rawValue,
    };

  // border-width-<k> → border.width.<k> · dimension
  m = token.match(/^border-width-(.+)$/);
  if (m)
    return {
      dotPath: `border.width.${m[1]}`,
      $type: "dimension",
      $value: rawValue,
    };

  // breakpoint-<k> → breakpoint.<k> · dimension
  m = token.match(/^breakpoint-(.+)$/);
  if (m)
    return {
      dotPath: `breakpoint.${m[1]}`,
      $type: "dimension",
      $value: rawValue,
    };

  // focus-ring-offset → focus-ring.offset · dimension
  if (token === "focus-ring-offset")
    return {
      dotPath: "focus-ring.offset",
      $type: "dimension",
      $value: rawValue,
    };

  // font-size-<k> → font.size.<k> · dimension
  m = token.match(/^font-size-(.+)$/);
  if (m)
    return {
      dotPath: `font.size.${m[1]}`,
      $type: "dimension",
      $value: rawValue,
    };

  // font-lineheight-<k> → font.lineheight.<k> · dimension
  m = token.match(/^font-lineheight-(.+)$/);
  if (m)
    return {
      dotPath: `font.lineheight.${m[1]}`,
      $type: "dimension",
      $value: rawValue,
    };

  // font-weight-<k> → font.weight.<k> · fontWeight (numeric)
  m = token.match(/^font-weight-(.+)$/);
  if (m) {
    // Guard against non-numeric weight: emit numeric if valid, else fall back to raw string.
    const numVal = Number(rawValue);
    return {
      dotPath: `font.weight.${m[1]}`,
      $type: "fontWeight",
      $value: !isNaN(numVal) ? numVal : rawValue,
    };
  }

  // font-family-<k> → font.family.<k> · fontFamily
  m = token.match(/^font-family-(.+)$/);
  if (m)
    return {
      dotPath: `font.family.${m[1]}`,
      $type: "fontFamily",
      $value: rawValue,
    };

  // font-letterspacing-normal → font.letterspacing.normal · dimension
  if (token === "font-letterspacing-normal")
    return {
      dotPath: "font.letterspacing.normal",
      $type: "dimension",
      $value: rawValue,
    };

  // font-letterspacing-wide-<n> → font.letterspacing.wide.<n> · dimension
  m = token.match(/^font-letterspacing-wide-(.+)$/);
  if (m)
    return {
      dotPath: `font.letterspacing.wide.${m[1]}`,
      $type: "dimension",
      $value: rawValue,
    };

  // size-icon-<k> → icon.<k> · dimension (top-level icon, matches frozen)
  m = token.match(/^size-icon-(.+)$/);
  if (m)
    return { dotPath: `icon.${m[1]}`, $type: "dimension", $value: rawValue };

  // size-height-<k> → size.height.<k> · dimension
  m = token.match(/^size-height-(.+)$/);
  if (m)
    return {
      dotPath: `size.height.${m[1]}`,
      $type: "dimension",
      $value: rawValue,
    };

  // size-trigger-<rest> → size.trigger.<rest> · dimension
  m = token.match(/^size-trigger-(.+)$/);
  if (m)
    return {
      dotPath: `size.trigger.${m[1]}`,
      $type: "dimension",
      $value: rawValue,
    };

  return null; // unrecognised — skip
}

/**
 * Derives the numeric/dimension token tree from tokens.md value tables.
 * Routing follows the brief's exact table. After routing all md rows the
 * figma-only carry-forwards (legacy size scale + brand font) are injected.
 *
 * @param {{ tokensMd: string }} opts
 * @returns {object} DTCG tree
 */
function deriveNumericTree({ tokensMd }) {
  const tree = {};

  for (const { token, value, status } of parseValues(tokensMd)) {
    const route = routeToken(token, value);
    if (!route) continue;
    const leaf = {
      $type: route.$type,
      $value: route.$value,
      $extensions: { "com.actian.status": status },
    };
    setPath(tree, route.dotPath, leaf);
  }

  // text-styles composite typography — from §2.2 table
  for (const spec of parseTextStyles(tokensMd)) {
    setPath(tree, `font.text-styles.${spec.name}`, buildTextStyle(spec));
  }

  // figma-only carry-forwards — legacy size scale
  for (const [key, px] of Object.entries(FIGMA_ONLY_SIZE)) {
    setPath(tree, `size.${key}`, {
      $type: "dimension",
      $value: px,
      $extensions: { "com.actian.status": "figma-only" },
    });
  }

  // figma-only carry-forward — brand font
  setPath(tree, "font.family.brand", {
    $type: "fontFamily",
    $value: "AllRpungGothic",
    $extensions: { "com.actian.status": "figma-only" },
  });

  return tree;
}

// ─── P3: Composite styles assembler ─────────────────────────────────────────

/**
 * Resolves a color ref like "neutral-100" or "primary-500" or "white" to the
 * DTCG alias string "{color.<role>.<shade>}" or "{color.primitive.<singleton>}".
 * Used in composite border/focus-ring extensions.
 */
function colorRefToAlias(colorRef) {
  // Singleton (no shade): "white", "black", etc.
  const m = colorRef.match(/^(.+)-(\d{2,3})$/);
  if (!m) return `{color.primitive.${colorRef}}`;
  const [, role, shade] = m;
  return `{color.${role}.${shade}}`;
}

/**
 * Derives border, focus-ring, and shadow composite token trees.
 * Color $value is resolved to the Actian theme hex via the P2 resolver so
 * border/focus-ring leaves are parity-comparable with frozen tokens.json.
 * The composite parts (width/style/color-alias) are preserved in
 * $extensions.com.actian.border / com.actian.focusRing for P4 css emission.
 *
 * Integration choice: kept as a standalone exported function (not merged into
 * deriveNumericTree) because it requires primitivesMd+tokensMd+resolver setup
 * that deriveNumericTree intentionally avoids. Task 6's CLI deep-merges the
 * composite tree alongside the numeric tree. This keeps Task 2's tests green
 * with zero changes to deriveNumericTree.
 *
 * @param {{ tokensMd: string, primitivesMd: string }} opts
 * @returns {{ border: object, "focus-ring": object, shadow: object }}
 */
function deriveCompositeStyles({ tokensMd, primitivesMd }) {
  // Build resolver (same as deriveSemanticTree setup, minimal — no Figma bindings needed).
  const primitiveTree = derivePrimitiveTree({
    primitivesMd,
    rawBindings: { variables: [] },
  });
  const globalRoles = parseGlobalRoles(tokensMd);
  const themes = parseThemes(tokensMd);
  const R = buildResolver({ primitiveTree, globalRoles, themes });

  const borderTree = {};
  for (const { name, width, color, status } of parseBorderStyles(tokensMd)) {
    const hex = R.resolveHex(color, "actian");
    borderTree[name] = {
      $type: "color",
      $value: hex,
      $extensions: {
        "com.actian.status": status,
        "com.actian.border": {
          width,
          style: "solid",
          color: colorRefToAlias(color),
        },
      },
    };
  }

  const focusTree = {};
  for (const { name, width, color, status } of parseFocusStyles(tokensMd)) {
    const hex = R.resolveHex(color, "actian");
    focusTree[name] = {
      $type: "color",
      $value: hex,
      $extensions: {
        "com.actian.status": status,
        "com.actian.focusRing": {
          width,
          style: "solid",
          color: colorRefToAlias(color),
        },
      },
    };
  }

  const shadowTree = {};
  for (const { name, value, status } of parseShadows(tokensMd)) {
    shadowTree[name] = {
      $type: "shadow",
      $value: value,
      $extensions: { "com.actian.status": status },
    };
  }

  return { border: borderTree, "focus-ring": focusTree, shadow: shadowTree };
}

// ─── P3: Motion family assembler ─────────────────────────────────────────────

/**
 * Derives the motion token tree from §2.11 of tokens.md.
 *
 * Emits three sub-families under `motion`:
 *   motion.duration.<k>  $type:"duration"  $value:"200ms"   — transition durations
 *   motion.ease.<k>      $type:"string"    $value:"ease-out" — CSS easing keywords
 *   motion.delay.<k>     $type:"duration"  $value:"20ms"    — pre-animation delays
 *
 * NOTE on $type:"string" for easing: DTCG's `cubicBezier` type requires a 4-number
 * tuple (P1x, P1y, P2x, P2y). These tokens hold CSS keyword values (`ease-out`,
 * `ease-in`, `ease-in-out`) which are aliases for built-in cubic-bezier curves —
 * they are NOT numeric tuples. Using $type:"string" correctly represents the
 * keyword as-is; a P4 CSS emitter can emit them verbatim without conversion.
 *
 * Integration choice: standalone exported function (not merged into deriveNumericTree
 * or deriveCompositeStyles) because motion needs no color resolver or Figma bindings —
 * only tokensMd. Task 6's CLI deep-merges the motion tree alongside numeric and
 * composite trees. This keeps Task 2/4 tests green with zero changes to their assemblers.
 *
 * All §2.11 tokens are 🟡 Proposed — verified per row via statusFrom().
 * Motion is a new family with no frozen tokens.json counterpart; Task 7 parity
 * will not check it.
 *
 * @param {{ tokensMd: string }} opts
 * @returns {{ motion: { duration: object, ease: object, delay: object } }}
 */
function deriveMotion({ tokensMd }) {
  const { duration, easing, delay } = parseMotion(tokensMd);

  const tree = { motion: { duration: {}, ease: {}, delay: {} } };

  for (const { name, value, status } of duration) {
    tree.motion.duration[name] = {
      $type: "duration",
      $value: value,
      $extensions: { "com.actian.status": status },
    };
  }

  for (const { name, value, status } of easing) {
    tree.motion.ease[name] = {
      $type: "string",
      $value: value,
      $extensions: { "com.actian.status": status },
    };
  }

  for (const { name, value, status } of delay) {
    tree.motion.delay[name] = {
      $type: "duration",
      $value: value,
      $extensions: { "com.actian.status": status },
    };
  }

  return tree;
}

// ─── P3 shared helpers ────────────────────────────────────────────────────────

/**
 * Deep-merge two DTCG trees. Objects without $value/$type are recursed into;
 * leaf nodes (with $value or $type) in `b` replace those in `a` wholesale.
 * Returns a new object — neither `a` nor `b` is mutated.
 */
function deepMerge(a, b) {
  const out = Object.assign({}, a);
  for (const [k, bv] of Object.entries(b)) {
    const av = out[k];
    const aIntermediate =
      av && typeof av === "object" && !("$value" in av) && !("$type" in av);
    const bIntermediate =
      bv && typeof bv === "object" && !("$value" in bv) && !("$type" in bv);
    if (aIntermediate && bIntermediate) {
      out[k] = deepMerge(av, bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}

/**
 * Walk `tree`, computing each leaf's dot-path. If the path matches a key in
 * `bindings`, attach `$extensions["com.figma"]` on the leaf (mutates in place).
 */
function attachBindings(tree, bindings, prefix) {
  if (!prefix) prefix = "";
  for (const [k, v] of Object.entries(tree)) {
    const dotPath = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && ("$value" in v || "$type" in v)) {
      if (bindings[dotPath]) {
        v.$extensions = v.$extensions || {};
        v.$extensions["com.figma"] = bindings[dotPath];
      }
    } else if (v && typeof v === "object") {
      attachBindings(v, bindings, dotPath);
    }
  }
}

/** Count leaf nodes (those with $value or $type) in a DTCG tree. */
function countLeaves(tree) {
  if (!tree || typeof tree !== "object") return 0;
  if ("$value" in tree || "$type" in tree) return 1;
  return Object.values(tree).reduce((acc, v) => acc + countLeaves(v), 0);
}

// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const primitivesMd = fs.readFileSync(
    path.join(REPO_ROOT, "foundations", "src", "color-primitives.md"),
    "utf8",
  );
  const tokensMd = fs.readFileSync(
    path.join(REPO_ROOT, "foundations", "src", "tokens.md"),
    "utf8",
  );
  const rawBindings = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, "tokens", "src", "figma-bindings-raw.json"),
      "utf8",
    ),
  );
  const outDir = path.join(REPO_ROOT, "tokens", "src", "derived");
  fs.mkdirSync(outDir, { recursive: true });

  // Primitive tree
  const tree = derivePrimitiveTree({ primitivesMd, rawBindings });
  fs.writeFileSync(
    path.join(outDir, "primitives.tokens.json"),
    JSON.stringify(tree, null, 2) + "\n",
  );
  const n = Object.values(tree.color.primitive).reduce(
    (a, v) => a + (v.$type ? 1 : Object.keys(v).length),
    0,
  );
  process.stdout.write(
    `[derive-tokens] wrote ${n} primitive tokens to tokens/src/derived/primitives.tokens.json\n`,
  );

  // Formula lint — report-only, never exit non-zero.
  const lintWarnings = [];
  for (const [palette, palData] of Object.entries(tree.color.primitive)) {
    if (typeof palData !== "object" || palData.$type) continue; // skip singletons
    const shades = {};
    for (const [shade, leaf] of Object.entries(palData)) {
      if (leaf && leaf.$value) shades[shade] = leaf.$value;
    }
    try {
      lintWarnings.push(...lintShadeRamp(palette, shades));
    } catch (e) {
      process.stderr.write(
        `[derive-tokens] formula-lint: skipped (${e.message})\n`,
      );
    }
  }
  process.stderr.write(
    `[derive-tokens] formula-lint: ${lintWarnings.length} off-ramp shades (warn)\n`,
  );

  // Semantic tree — primitivesMd = color-primitives.md (palette rows only);
  // semanticsMd = tokens.md (role/theme tables + resolves-to tables).
  const semTree = deriveSemanticTree({
    primitivesMd,
    semanticsMd: tokensMd,
    rawBindings,
  });
  fs.writeFileSync(
    path.join(outDir, "semantics.tokens.json"),
    JSON.stringify(semTree, null, 2) + "\n",
  );
  const sn = Object.values(semTree.color).reduce(
    (a, v) => a + (v.$type ? 1 : Object.keys(v).length),
    0,
  );
  process.stdout.write(
    `[derive-tokens] wrote ${sn} semantic tokens to tokens/src/derived/semantics.tokens.json\n`,
  );

  // Numeric tree (P3): numeric + composite styles + motion, with bindings.
  const numericBase = deriveNumericTree({ tokensMd });
  const compositeTree = deriveCompositeStyles({ tokensMd, primitivesMd });
  const motionTree = deriveMotion({ tokensMd });

  // Deep-merge: composite (border styles + focus-ring styles + shadow) first,
  // then motion (top-level motion subtree), into the numeric base.
  let numericTree = deepMerge(numericBase, compositeTree);
  numericTree = deepMerge(numericTree, motionTree);

  // Attach numeric Figma bindings on matching leaves.
  const numBindings = curateNumericBindings(rawBindings);
  attachBindings(numericTree, numBindings);

  fs.writeFileSync(
    path.join(outDir, "numerics.tokens.json"),
    JSON.stringify(numericTree, null, 2) + "\n",
  );
  const nn = countLeaves(numericTree);
  process.stdout.write(
    `[derive-tokens] wrote ${nn} numeric tokens to tokens/src/derived/numerics.tokens.json\n`,
  );
}

if (require.main === module) main();

module.exports = {
  derivePrimitiveTree,
  deriveSemanticTree,
  deriveNumericTree,
  deriveCompositeStyles,
  deriveMotion,
  deepMerge,
};
