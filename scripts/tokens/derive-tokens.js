// scripts/tokens/derive-tokens.js
"use strict";
const fs = require("fs");
const path = require("path");
const { parsePrimitives } = require("./lib/parse-primitives.js");
const { hexToOklch, formatOklch } = require("./lib/oklch.js");
const { curatePrimitiveBindings } = require("./lib/curate-bindings.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function derivePrimitiveTree({ primitivesMd, rawBindings }) {
  const prims = parsePrimitives(primitivesMd);
  const bindings = curatePrimitiveBindings(rawBindings);
  const tree = { color: { primitive: {} } };
  for (const { palette, shade, hex } of prims) {
    const ext = { "com.actian.oklch": formatOklch(hexToOklch(hex)) };
    const tokenPath = shade ? `color.primitive.${palette}.${shade}` : `color.primitive.${palette}`;
    if (bindings[tokenPath]) ext["com.figma"] = bindings[tokenPath];
    const leaf = { $type: "color", $value: hex, $extensions: ext };
    const palObj = (tree.color.primitive[palette] = tree.color.primitive[palette] || {});
    if (shade) palObj[shade] = leaf;
    else tree.color.primitive[palette] = leaf;
  }
  return tree;
}

function main() {
  const primitivesMd = fs.readFileSync(
    path.join(REPO_ROOT, "foundations", "src", "color-primitives.md"), "utf8");
  const rawBindings = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, "tokens", "src", "figma-bindings-raw.json"), "utf8"));
  const tree = derivePrimitiveTree({ primitivesMd, rawBindings });
  const outDir = path.join(REPO_ROOT, "tokens", "src", "derived");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "primitives.tokens.json"), JSON.stringify(tree, null, 2) + "\n");
  const n = Object.values(tree.color.primitive).reduce(
    (a, v) => a + (v.$type ? 1 : Object.keys(v).length), 0);
  process.stdout.write(`[derive-tokens] wrote ${n} primitive tokens to tokens/src/derived/primitives.tokens.json\n`);
}

if (require.main === module) main();

module.exports = { derivePrimitiveTree };
