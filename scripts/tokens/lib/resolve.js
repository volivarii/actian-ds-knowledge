"use strict";
// Resolves a semantic ref to a primitive hex for a given theme.

function primHex(primitiveTree, palette, shade) {
  const node = primitiveTree.color.primitive[palette];
  if (!node) throw new Error(`resolve: unknown palette '${palette}'`);
  const leaf = shade == null ? node : node[shade];
  if (!leaf || !leaf.$value) throw new Error(`resolve: no value for ${palette}${shade ? "." + shade : ""}`);
  return leaf.$value.toUpperCase();
}

function buildResolver({ primitiveTree, globalRoles, themes }) {
  function paletteForRole(role, theme) {
    const t = themes[theme] || {};
    if (t[role]) return t[role]; // theme-varying (primary/neutral)
    if (globalRoles[role]) return globalRoles[role]; // theme-invariant fallback
    throw new Error(`resolve: unknown role '${role}'`);
  }
  function resolveHex(ref, theme) {
    // singleton primitive (black/white/...): present directly as a palette with $value
    const direct = primitiveTree.color.primitive[ref];
    if (direct && direct.$value) return direct.$value.toUpperCase();
    const m = ref.match(/^(.+)-(\d{2,3})$/);
    if (!m) throw new Error(`resolve: cannot parse ref '${ref}'`);
    const [, base, shade] = m;
    // base is a role → map through theme; otherwise treat base as a literal palette
    const palette = (themes[theme] && themes[theme][base]) || globalRoles[base] || base;
    return primHex(primitiveTree, palette, shade);
  }
  return { resolveHex, paletteForRole };
}

function applyAlpha(hex, opacity) {
  if (opacity == null) return hex;
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, "0").toUpperCase();
  return hex.replace(/^#/, "#").slice(0, 7) + a;
}

module.exports = { buildResolver, applyAlpha };
