"use strict";
// P2 name layer — key-based join from Figma local variable ids to PUBLISHED
// --zen-* custom property names.
//
// The join chain (no name guessing — the harvest's 45%-resolve-to-nothing
// class stays dead):
//   REST boundVariables.id  (local VariableID:... in the dskit file)
//     -> tokens/src/figma-variable-ids.json  (plugin export: id -> stable key)
//     -> tokens/src/figma-bindings-raw.json  (key -> variable, same input the
//        tokens generator curates into DTCG paths)
//     -> mechanical DTCG-path -> --zen-* candidates
//     -> HARD GATE: the name must exist in tokens/tokens.css AND its value
//        must fit the slot type (color slots need a color value, length slots
//        a length). Composite values ("1px solid #x") qualify for neither.
// Any miss anywhere degrades to value-only capture, never a wrong name.
var fs = require("fs");
var path = require("path");
var CB = require("../tokens/lib/curate-bindings");

// First occurrence wins: the :root/actian block leads tokens.css, so themed
// re-declarations later in the file never override the default value.
function parseDefinedVars(cssText) {
  var out = {};
  if (typeof cssText !== "string") return out;
  var re = /(--zen-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  var m;
  while ((m = re.exec(cssText))) {
    if (!(m[1] in out)) out[m[1]] = m[2].trim();
  }
  return out;
}

function isColorValue(v) {
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(/i.test(v);
}

function isLengthValue(v) {
  return /^-?\d*\.?\d+(px|rem|em|%)$/.test(v);
}

// The semantic component color slices the tokens generator intentionally
// skips today ("P2 semantic binding" in curate-bindings.js). Mapped here for
// the NAME layer only; anything without a published color-valued var (e.g.
// color-border-* — only the composite --zen-border-* exists) is dropped by
// the existence/type gate downstream, never mis-bound.
function curateP2SemanticColors(raw) {
  var map = {};
  var vars = raw && Array.isArray(raw.variables) ? raw.variables : [];
  for (var i = 0; i < vars.length; i++) {
    var v = vars[i];
    if (!v || v.variableType !== "COLOR" || typeof v.name !== "string")
      continue;
    var m = v.name.match(/^color-(icon|text|bg|border)-(.+)$/);
    if (!m || typeof v.key !== "string" || !v.key) continue;
    map["color." + m[1] + "." + m[2]] = { variableKey: v.key };
  }
  return map;
}

// DTCG path -> the single published --zen-* candidate, mirroring emit-css
// naming mechanically: join the path segments with dashes. NO structural
// segment dropping. A dropped-segment guess produced ONLY wrong names in
// production (size.height.<k> -> --zen-size-<k>, an unrelated 8/16/24/32px
// scale, NOT the 32/40/48/56px height scale) and ZERO correct ones — exactly
// the name-guessing this module exists to forbid, and the color-vs-length
// type gate cannot catch it because both scales are lengths. A path whose
// full --zen name is not published simply carries no name (value-only).
function pathToVarCandidates(tokenPath) {
  return ["--zen-" + String(tokenPath).split(".").join("-")];
}

function buildKeyToPath(bindingsRaw) {
  var raw = bindingsRaw || {};
  // The generator's own curations are authoritative; the P2 semantic slice
  // fills only paths the generator does not claim (assign order: P2 first,
  // generator curations overwrite).
  var merged = Object.assign(
    {},
    curateP2SemanticColors(raw),
    CB.curatePrimitiveBindings(raw),
    CB.curateSemanticBindings(raw),
    CB.curateNumericBindings(raw),
  );
  var keyToPath = {};
  Object.keys(merged)
    .sort()
    .forEach(function (p) {
      var k = merged[p] && merged[p].variableKey;
      if (typeof k === "string" && k && !(k in keyToPath)) keyToPath[k] = p;
    });
  return keyToPath;
}

function buildTokenNameMaps(input) {
  var opts = input || {};
  var varNameById = {};
  var colorNameById = {};
  var lengthNameById = {};
  var defined = parseDefinedVars(opts.tokensCssText);
  var keyToPath = buildKeyToPath(opts.bindingsRaw);
  var ids =
    opts.idsExport &&
    opts.idsExport.ids &&
    typeof opts.idsExport.ids === "object"
      ? opts.idsExport.ids
      : {};
  Object.keys(ids)
    .sort()
    .forEach(function (id) {
      var entry = ids[id];
      var key = entry && entry.key;
      if (typeof key !== "string" || !key) return;
      var tokenPath = keyToPath[key];
      if (!tokenPath) return;
      var cands = pathToVarCandidates(tokenPath);
      for (var i = 0; i < cands.length; i++) {
        var name = cands[i];
        if (!(name in defined)) continue;
        varNameById[id] = name;
        var val = defined[name];
        if (isColorValue(val)) colorNameById[id] = name;
        else if (isLengthValue(val)) lengthNameById[id] = name;
        break;
      }
    });
  return {
    varNameById: varNameById,
    colorNameById: colorNameById,
    lengthNameById: lengthNameById,
  };
}

// Disk-backed wrapper for the sync: reads the committed artifacts and is
// TOLERANT of the export not existing yet (the stub ships empty; Vincent
// populates it by running scripts/figma-plugin in the dskit file). Absent or
// malformed inputs mean empty maps = today's values-only capture.
function loadTokenNameMaps(repoRoot) {
  function readJson(p) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
      return null;
    }
  }
  function readText(p) {
    try {
      return fs.readFileSync(p, "utf8");
    } catch (e) {
      return null;
    }
  }
  return buildTokenNameMaps({
    idsExport: readJson(
      path.join(repoRoot, "tokens", "src", "figma-variable-ids.json"),
    ),
    bindingsRaw: readJson(
      path.join(repoRoot, "tokens", "src", "figma-bindings-raw.json"),
    ),
    tokensCssText: readText(path.join(repoRoot, "tokens", "tokens.css")),
  });
}

module.exports = {
  buildTokenNameMaps: buildTokenNameMaps,
  loadTokenNameMaps: loadTokenNameMaps,
  __parseDefinedVars: parseDefinedVars,
  __pathToVarCandidates: pathToVarCandidates,
  __curateP2SemanticColors: curateP2SemanticColors,
};
