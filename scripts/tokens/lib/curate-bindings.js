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

/**
 * Maps numeric Figma collections (Spacing, Borders, Height, Trigger area, Icon,
 * Focus rings, Font / Text) to DTCG token paths.
 *
 * Skip rules:
 *   - Borders: skip color-border-* (P2 semantic binding)
 *   - Icon: skip color-icon-* (P2 semantic binding)
 *   - Font / Text: skip color-text-* (P2 semantic binding);
 *     skip font-letterspacing-* (Figma names 1/2/3/4 don't match tree's wide.N)
 *
 * @param {object} raw  — figma-bindings-raw.json root
 * @returns {{ [tokenPath: string]: { variableKey: string, scopes: string[] } }}
 */
function curateNumericBindings(raw) {
  const map = {};
  const vars = (raw && raw.variables) || [];
  for (const v of vars) {
    const coll = v.variableCollectionName;
    const name = String(v.name);
    const binding = { variableKey: v.key, scopes: v.scopes || [] };

    if (coll === "Spacing") {
      // "Spacing/spacing-<k>" → "spacing.<k>"
      const m = name.match(/^Spacing\/spacing-(.+)$/);
      if (m) map[`spacing.${m[1]}`] = binding;
      continue;
    }

    if (coll === "Borders") {
      if (name.startsWith("color-border-")) continue; // P2 semantic — skip
      let m = name.match(/^border-radius-(.+)$/);
      if (m) {
        map[`border.radius.${m[1]}`] = binding;
        continue;
      }
      m = name.match(/^border-width-(.+)$/);
      if (m) {
        map[`border.width.${m[1]}`] = binding;
        continue;
      }
      m = name.match(/^border-(.+)$/); // border-default / border-subtle / …
      if (m) {
        map[`border.${m[1]}`] = binding;
        continue;
      }
      continue;
    }

    if (coll === "Height") {
      // "size-height-<k>" → "size.height.<k>"
      const m = name.match(/^size-height-(.+)$/);
      if (m) map[`size.height.${m[1]}`] = binding;
      continue;
    }

    if (coll === "Trigger area") {
      // "size-trigger-<rest>" → "size.trigger.<rest>"
      const m = name.match(/^size-trigger-(.+)$/);
      if (m) map[`size.trigger.${m[1]}`] = binding;
      continue;
    }

    if (coll === "Icon") {
      if (name.startsWith("color-icon-")) continue; // P2 semantic — skip
      // "size-icon-<k>" → "icon.<k>"
      const m = name.match(/^size-icon-(.+)$/);
      if (m) map[`icon.${m[1]}`] = binding;
      continue;
    }

    if (coll === "Focus rings") {
      // "focus-ring-offset" → "focus-ring.offset"; "focus-ring-<x>" → "focus-ring.<x>"
      const m = name.match(/^focus-ring-(.+)$/);
      if (m) {
        map[`focus-ring.${m[1]}`] = binding;
        continue;
      }
      continue;
    }

    if (coll === "Font / Text") {
      if (name.startsWith("color-text-")) continue; // P2 semantic — skip
      if (name.startsWith("font-letterspacing-")) continue; // naming mismatch — skip
      let m = name.match(/^font-family-(.+)$/);
      if (m) {
        map[`font.family.${m[1]}`] = binding;
        continue;
      }
      m = name.match(/^font-size-(.+)$/);
      if (m) {
        map[`font.size.${m[1]}`] = binding;
        continue;
      }
      m = name.match(/^font-weight-(.+)$/);
      if (m) {
        map[`font.weight.${m[1]}`] = binding;
        continue;
      }
      m = name.match(/^font-lineheight-(.+)$/);
      if (m) {
        map[`font.lineheight.${m[1]}`] = binding;
        continue;
      }
      continue;
    }
  }
  return map;
}

module.exports = {
  curatePrimitiveBindings,
  curateSemanticBindings,
  curateNumericBindings,
};
