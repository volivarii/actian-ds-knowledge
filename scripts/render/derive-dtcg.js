"use strict";

// derive-dtcg.js — emit a clean, portable DTCG token export for external
// consumers (the Claude Design bundle, docs, third parties).
//
// tokens/tokens.json is ALREADY in the DTCG W3C format (derive-tokens.js emits
// $type/$value leaves), so this is a portability layer, not a format conversion:
//   - normalize any raw leaf into a { $value, $type } DTCG leaf (idempotent on
//     already-DTCG input, so the same function serves both the unit tests and
//     the real token tree);
//   - drop repo-internal provenance that is not part of the DTCG contract
//     (_schema_version, $metadata) so a strict DTCG parser accepts the file;
//   - strip Actian-internal Figma variable keys from $extensions while keeping
//     the portable oklch values and DTCG alias references verbatim.
//
// toDtcg(tokensJson) returns the cleaned DTCG object.

var fs = require("node:fs");
var path = require("node:path");

function isDtcgLeaf(o) {
  return (
    o &&
    typeof o === "object" &&
    !Array.isArray(o) &&
    Object.prototype.hasOwnProperty.call(o, "$value")
  );
}

// Infer a DTCG $type from a raw leaf value. Only needed for the raw-input path;
// real tokens already carry $type, which takes precedence.
function inferType(v) {
  if (typeof v === "number") return "number";
  if (typeof v === "string") {
    if (/^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|rgba|hsl|hsla|oklch)\(/i.test(v)) {
      return "color";
    }
    if (/^-?\d*\.?\d+(px|rem|em)$/.test(v)) return "dimension";
    if (/^-?\d*\.?\d+m?s$/.test(v)) return "duration";
    return "string";
  }
  return undefined;
}

// Keep portable $extensions (oklch), drop Actian-internal Figma variable keys.
// Returns undefined when nothing portable remains, so the leaf omits $extensions.
function cleanExtensions(ext) {
  if (!ext || typeof ext !== "object") return undefined;
  var out = {};
  Object.keys(ext).forEach(function (k) {
    if (k === "com.figma") return;
    out[k] = ext[k];
  });
  return Object.keys(out).length ? out : undefined;
}

function normalizeLeaf(leaf) {
  var out = { $value: leaf.$value, $type: leaf.$type || inferType(leaf.$value) };
  if (leaf.$description !== undefined) out.$description = leaf.$description;
  if (leaf.$deprecated !== undefined) out.$deprecated = leaf.$deprecated;
  var ext = cleanExtensions(leaf.$extensions);
  if (ext) out.$extensions = ext;
  return out;
}

function toDtcg(node) {
  // Raw primitive leaf (the unit-test path): wrap into a DTCG leaf.
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return { $value: node, $type: inferType(node) };
  }
  // Already-DTCG leaf (including composite $value like typography/shadow, and
  // alias references whose $value is a "{group.path}" string): normalize.
  if (isDtcgLeaf(node)) return normalizeLeaf(node);
  // Group: recurse, dropping repo-internal keys and non-standard $metadata,
  // keeping standard DTCG group annotations ($schema, $description, $type, ...).
  var out = {};
  Object.keys(node).forEach(function (k) {
    if (k[0] === "_") return;
    if (k === "$metadata") return;
    if (k[0] === "$") {
      out[k] = node[k];
      return;
    }
    out[k] = toDtcg(node[k]);
  });
  return out;
}

function deriveFromFile(tokensPath) {
  var tokens = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
  return toDtcg(tokens);
}

if (require.main === module) {
  var repoRoot = path.resolve(__dirname, "..", "..");
  var src = path.join(repoRoot, "tokens", "tokens.json");
  var outDir = path.join(repoRoot, "tokens", "dist");
  var outFile = path.join(outDir, "tokens.dtcg.json");
  var dtcg = deriveFromFile(src);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(dtcg, null, 2) + "\n");
  process.stdout.write("wrote " + outFile + "\n");
}

module.exports = {
  toDtcg: toDtcg,
  deriveFromFile: deriveFromFile,
  inferType: inferType,
  cleanExtensions: cleanExtensions,
};
