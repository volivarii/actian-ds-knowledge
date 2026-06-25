"use strict";
// P0: curate the primitive slice of the Figma binding sidecar from the raw harvest.
// Later phases extend this to semantic/numeric collections.

const EXCLUDE = new Set(["warm-grey"]);

function curatePrimitiveBindings(raw) {
  const map = {};
  const vars = (raw && raw.variables) || [];
  for (const v of vars) {
    if (v.variableCollectionName !== "Zen colors" || v.variableType !== "COLOR")
      continue;
    const parts = String(v.name).split("/"); // "royal-blue/500" or "white"
    const palette = parts[0];
    const shade = parts[1] || null;
    if (EXCLUDE.has(palette)) continue;
    const path = shade
      ? `color.primitive.${palette}.${shade}`
      : `color.primitive.${palette}`;
    map[path] = { variableKey: v.key, scopes: v.scopes || [] };
  }
  return map;
}

// Global colors collection → color.<role>.<shade>
function curateSemanticBindings(raw) {
  const map = {};
  const vars = (raw && raw.variables) || [];
  for (const v of vars) {
    if (
      v.variableCollectionName !== "Global colors" ||
      v.variableType !== "COLOR"
    )
      continue;
    const parts = String(v.name).split("/"); // "primary/500"
    if (parts.length !== 2) continue;
    map[`color.${parts[0]}.${parts[1]}`] = {
      variableKey: v.key,
      scopes: v.scopes || [],
    };
  }
  return map;
}

module.exports = { curatePrimitiveBindings, curateSemanticBindings };
