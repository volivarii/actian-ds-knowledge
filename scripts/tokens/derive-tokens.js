// scripts/tokens/derive-tokens.js
"use strict";
const fs = require("fs");
const path = require("path");
const { parsePrimitives } = require("./lib/parse-primitives.js");
const { hexToOklch, formatOklch } = require("./lib/oklch.js");
const {
  curatePrimitiveBindings,
  curateSemanticBindings,
} = require("./lib/curate-bindings.js");
const { parseGlobalRoles, parseThemes } = require("./lib/parse-themes.js");
const { parseSemantics } = require("./lib/parse-semantics.js");
const { buildResolver, applyAlpha } = require("./lib/resolve.js");
const { lintShadeRamp } = require("./lib/formula-lint.js");
const { parseValues } = require("./lib/parse-values.js");

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
  if (m)
    return {
      dotPath: `font.weight.${m[1]}`,
      $type: "fontWeight",
      $value: Number(rawValue),
    };

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
}

if (require.main === module) main();

module.exports = { derivePrimitiveTree, deriveSemanticTree, deriveNumericTree };
