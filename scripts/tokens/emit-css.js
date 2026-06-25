// scripts/tokens/emit-css.js
"use strict";

function lc(hex) {
  return hex ? hex.toLowerCase() : hex;
}

function walkLeaves(tree, pathSoFar, collector) {
  if (!tree || typeof tree !== "object") return;
  if ("$value" in tree || "$type" in tree) {
    collector.push({ path: pathSoFar, leaf: tree });
    return;
  }
  for (const [k, v] of Object.entries(tree)) {
    walkLeaves(v, [...pathSoFar, k], collector);
  }
}

function resolveRef(ref, fullTree) {
  const m = ref && typeof ref === "string" && ref.match(/^\{(.+)\}$/);
  if (!m) return ref;
  const parts = m[1].split(".");
  let cur = fullTree;
  for (const p of parts) {
    cur = cur?.[p];
    if (cur === undefined) return ref;
  }
  return cur?.$value !== undefined ? cur.$value : ref;
}

function resolveColorThemes(colorRef, fullTree) {
  const m = colorRef && typeof colorRef === "string" && colorRef.match(/^\{(.+)\}$/);
  if (!m) return null;
  const parts = m[1].split(".");
  let cur = fullTree;
  for (const p of parts) {
    cur = cur?.[p];
    if (cur === undefined) return null;
  }
  const themes = cur?.$extensions?.["com.actian.themes"];
  if (!themes) return null;
  return { actian: lc(themes.actian), studio: lc(themes.studio), explorer: lc(themes.explorer) };
}

const COLOR_SEMANTIC_GROUPS = [
  "annotation", "bg", "error", "icon", "neutral", "primary", "success", "text", "warning",
];

const SPACING_ORDER = ["3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"];
const SIZE_ORDER = ["sx", "sm", "md", "lg", "xl", "2xl", "3xl"];
const BREAKPOINT_ORDER = ["sm", "md", "lg", "xl"];
const FAMILY_ORDER = ["brand", "mono", "text"];
const WEIGHT_ORDER = ["regular", "medium", "semibold", "bold"];
const FONT_SIZE_ORDER = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"];
const LINEHEIGHT_ORDER = ["xs", "sm", "md", "lg", "xl", "2xl"];
const LETTERSPACING_WIDE_ORDER = ["1", "2", "3", "4"];
const TEXT_STYLE_ORDER = [
  "heading-display", "heading-prominent", "heading-standard", "heading-subtle", "heading-micro",
  "body-display", "body-prominent", "body-standard", "body-subtle", "body-micro",
  "label-standard", "label-subtle", "label-micro",
];
const ICON_ORDER = ["xs", "sm", "md", "lg"];
const SHADOW_ORDER = ["xs", "sm", "md", "lg", "xl"];

const FAMILY_FORMAT = {
  brand: '"AllRpungGothic", sans-serif',
  mono: '"Roboto Mono", sans-serif',
  text: '"Roboto", sans-serif',
};

function collectVars(fullTree) {
  const vars = [];

  // ── Colors ──────────────────────────────────────────────────────────────────
  vars.push({ _sectionComment: "/* ── Colors ── */" });

  const colorVars = [];
  for (const group of COLOR_SEMANTIC_GROUPS) {
    const groupTree = fullTree.color?.[group];
    if (!groupTree) continue;
    const leaves = [];
    walkLeaves(groupTree, [], leaves);
    for (const { path, leaf } of leaves) {
      const themes = leaf?.$extensions?.["com.actian.themes"];
      if (!themes) continue;
      const suffix = path.length > 0 ? `-${path.join("-")}` : "";
      colorVars.push({
        varName: `--zen-color-${group}${suffix}`,
        actian: lc(themes.actian),
        studio: lc(themes.studio),
        explorer: lc(themes.explorer),
      });
    }
  }
  colorVars.sort((a, b) => a.varName.localeCompare(b.varName));
  vars.push(...colorVars);

  // Border composites → Colors section (not Border section)
  const borderCompositeVars = [];
  for (const [k, leaf] of Object.entries(fullTree.border || {})) {
    if (k === "radius" || k === "width") continue;
    if (!leaf || !("$value" in leaf)) continue;
    const colorRef = leaf.$extensions?.["com.actian.border"]?.color;
    const actian = lc(leaf.$value);
    let studio = actian;
    let explorer = actian;
    if (colorRef) {
      const resolved = resolveColorThemes(colorRef, fullTree);
      if (resolved) {
        studio = resolved.studio;
        explorer = resolved.explorer;
      }
    }
    borderCompositeVars.push({ varName: `--zen-border-${k}`, actian, studio, explorer });
  }
  borderCompositeVars.sort((a, b) => a.varName.localeCompare(b.varName));
  vars.push(...borderCompositeVars);

  // Focus-ring colors → Colors section (offset goes in Focus-ring section)
  const focusColorVars = [];
  for (const [k, leaf] of Object.entries(fullTree["focus-ring"] || {})) {
    if (k === "offset") continue;
    if (!leaf || !("$value" in leaf)) continue;
    const colorRef = leaf.$extensions?.["com.actian.focusRing"]?.color;
    const actian = lc(leaf.$value);
    let studio = actian;
    let explorer = actian;
    if (colorRef) {
      const resolved = resolveColorThemes(colorRef, fullTree);
      if (resolved) {
        studio = resolved.studio;
        explorer = resolved.explorer;
      }
    }
    focusColorVars.push({ varName: `--zen-focus-ring-${k}`, actian, studio, explorer });
  }
  focusColorVars.sort((a, b) => a.varName.localeCompare(b.varName));
  vars.push(...focusColorVars);

  // ── Spacing ─────────────────────────────────────────────────────────────────
  vars.push({ _sectionComment: "/* ── Spacing ── */" });
  for (const k of SPACING_ORDER) {
    const leaf = fullTree.spacing?.[k];
    if (!leaf) continue;
    vars.push({ varName: `--zen-spacing-${k}`, actian: leaf.$value, studio: leaf.$value, explorer: leaf.$value });
  }

  // ── Border ──────────────────────────────────────────────────────────────────
  // Only radius and width dimensions here; composites are in Colors section
  vars.push({ _sectionComment: "/* ── Border ── */" });
  const radVars = [];
  for (const [k, leaf] of Object.entries(fullTree.border?.radius || {})) {
    if (!leaf?.$value) continue;
    radVars.push({ varName: `--zen-border-radius-${k}`, actian: leaf.$value, studio: leaf.$value, explorer: leaf.$value });
  }
  radVars.sort((a, b) => a.varName.localeCompare(b.varName));
  vars.push(...radVars);
  const widthVars = [];
  for (const [k, leaf] of Object.entries(fullTree.border?.width || {})) {
    if (!leaf?.$value) continue;
    widthVars.push({ varName: `--zen-border-width-${k}`, actian: leaf.$value, studio: leaf.$value, explorer: leaf.$value });
  }
  widthVars.sort((a, b) => a.varName.localeCompare(b.varName));
  vars.push(...widthVars);

  // ── Size ────────────────────────────────────────────────────────────────────
  vars.push({ _sectionComment: "/* ── Size ── */" });
  for (const k of SIZE_ORDER) {
    const leaf = fullTree.size?.[k];
    if (!leaf) continue;
    vars.push({ varName: `--zen-size-${k}`, actian: leaf.$value, studio: leaf.$value, explorer: leaf.$value });
  }

  // ── Breakpoint ──────────────────────────────────────────────────────────────
  vars.push({ _sectionComment: "/* ── Breakpoint ── */" });
  for (const k of BREAKPOINT_ORDER) {
    const leaf = fullTree.breakpoint?.[k];
    if (!leaf) continue;
    vars.push({ varName: `--zen-breakpoint-${k}`, actian: leaf.$value, studio: leaf.$value, explorer: leaf.$value });
  }

  // ── Focus-ring ──────────────────────────────────────────────────────────────
  vars.push({ _sectionComment: "/* ── Focus-ring ── */" });
  const offsetLeaf = fullTree["focus-ring"]?.offset;
  if (offsetLeaf) {
    vars.push({ varName: "--zen-focus-ring-offset", actian: offsetLeaf.$value, studio: offsetLeaf.$value, explorer: offsetLeaf.$value });
  }

  // ── Font ────────────────────────────────────────────────────────────────────
  vars.push({ _sectionComment: "/* ── Font ── */" });
  for (const k of FAMILY_ORDER) {
    if (!fullTree.font?.family?.[k]) continue;
    const fmt = FAMILY_FORMAT[k] || `"${fullTree.font.family[k].$value}", sans-serif`;
    vars.push({ varName: `--zen-font-family-${k}`, actian: fmt, studio: fmt, explorer: fmt });
  }
  for (const k of WEIGHT_ORDER) {
    const leaf = fullTree.font?.weight?.[k];
    if (!leaf) continue;
    const val = String(leaf.$value);
    vars.push({ varName: `--zen-font-weight-${k}`, actian: val, studio: val, explorer: val });
  }
  for (const k of FONT_SIZE_ORDER) {
    const leaf = fullTree.font?.size?.[k];
    if (!leaf) continue;
    vars.push({ varName: `--zen-font-size-${k}`, actian: leaf.$value, studio: leaf.$value, explorer: leaf.$value });
  }
  for (const k of LINEHEIGHT_ORDER) {
    const leaf = fullTree.font?.lineheight?.[k];
    if (!leaf) continue;
    vars.push({ varName: `--zen-font-lineheight-${k}`, actian: leaf.$value, studio: leaf.$value, explorer: leaf.$value });
  }
  const lsNormal = fullTree.font?.letterspacing?.normal;
  if (lsNormal) {
    vars.push({ varName: "--zen-font-letterspacing-normal", actian: lsNormal.$value, studio: lsNormal.$value, explorer: lsNormal.$value });
  }
  for (const n of LETTERSPACING_WIDE_ORDER) {
    const leaf = fullTree.font?.letterspacing?.wide?.[n];
    if (!leaf) continue;
    vars.push({ varName: `--zen-font-letterspacing-wide-${n}`, actian: leaf.$value, studio: leaf.$value, explorer: leaf.$value });
  }

  // ── Icon ────────────────────────────────────────────────────────────────────
  vars.push({ _sectionComment: "/* ── Icon ── */" });
  for (const k of ICON_ORDER) {
    const leaf = fullTree.icon?.[k];
    if (!leaf) continue;
    vars.push({ varName: `--zen-icon-${k}`, actian: leaf.$value, studio: leaf.$value, explorer: leaf.$value });
  }

  // ── Typography (text styles) ─────────────────────────────────────────────────
  vars.push({ _sectionComment: "/* ── Typography (text styles) ── */" });
  for (const styleName of TEXT_STYLE_ORDER) {
    const styleLeaf = fullTree.font?.["text-styles"]?.[styleName];
    if (!styleLeaf?.$value) continue;
    const v = styleLeaf.$value;
    const weight = String(resolveRef(v.fontWeight, fullTree));
    const size = String(resolveRef(v.fontSize, fullTree));
    const lh = String(resolveRef(v.lineHeight, fullTree));
    const ls = String(resolveRef(v.letterSpacing, fullTree));
    const fam = "var(--zen-font-family-text)";
    const prefix = `--zen-font-${styleName}`;
    vars.push({ varName: `${prefix}-family`, actian: fam, studio: fam, explorer: fam });
    vars.push({ varName: `${prefix}-weight`, actian: weight, studio: weight, explorer: weight });
    vars.push({ varName: `${prefix}-size`, actian: size, studio: size, explorer: size });
    vars.push({ varName: `${prefix}-line-height`, actian: lh, studio: lh, explorer: lh });
    vars.push({ varName: `${prefix}-letter-spacing`, actian: ls, studio: ls, explorer: ls });
  }

  // ── Shadows ─────────────────────────────────────────────────────────────────
  vars.push({ _sectionComment: "/* ── Shadows ── */" });
  for (const k of SHADOW_ORDER) {
    const leaf = fullTree.shadow?.[k];
    if (!leaf) continue;
    vars.push({ varName: `--zen-shadow-${k}`, actian: leaf.$value, studio: leaf.$value, explorer: leaf.$value, multiline: true });
  }

  return vars;
}

function emitVar(entry, theme) {
  const value = entry[theme];
  if (entry.multiline) return `  ${entry.varName}:\n    ${value};`;
  return `  ${entry.varName}: ${value};`;
}

function emitCss(fullTree) {
  const allEntries = collectVars(fullTree);
  const actianLines = [];
  const studioLines = [];
  const explorerLines = [];

  for (const entry of allEntries) {
    if (entry._sectionComment) {
      actianLines.push(`  ${entry._sectionComment}`);
      continue;
    }
    actianLines.push(emitVar(entry, "actian"));
    if (entry.studio !== entry.actian) studioLines.push(emitVar(entry, "studio"));
    if (entry.explorer !== entry.actian) explorerLines.push(emitVar(entry, "explorer"));
  }

  const header = [
    "/**",
    " * Actian Design System 2026 — CSS Custom Properties",
    " * Generated by scripts/tokens/emit-css.js from tokens/src/derived/tokens.candidate.json",
    " * Prefix: --zen-",
    " */",
  ].join("\n");

  return [
    header,
    "",
    ':root,\n[data-theme="actian"] {',
    actianLines.join("\n"),
    "}",
    "",
    '[data-theme="studio"] {',
    studioLines.join("\n"),
    "}",
    "",
    '[data-theme="explorer"] {',
    explorerLines.join("\n"),
    "}",
    "",
  ].join("\n");
}

module.exports = { emitCss };
