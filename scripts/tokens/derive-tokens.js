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
    tree.color[role] = {};
    const actianPalette =
      (themes.actian && themes.actian[role]) || globalRoles[role];
    if (!actianPalette) continue;
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
    const tokenPath = `color.${s.group}.${s.name.replace(/\./g, ".")}`;
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

module.exports = { derivePrimitiveTree, deriveSemanticTree };
