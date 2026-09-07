"use strict";

// STRUCTURAL EVIDENCE: the variant values Figma records as a different SHAPE.
//
// `captured-variants-render-apart.test.js` joins the collapse census against
// `appearance.variants`, per-variant facts naming a background, border, text
// style or icon. That is one of the two places the capture states a difference,
// and it is the weaker one. The other is
// `<slug>.json#quality.structuralVariants`, which records that a value has a
// different CHILD LIST from the base, with both lists quoted:
//
//   { prop: "Emphasis", value: "Icon-only", reason: "childCount:3!=1",
//     base:    ["instance:Leading icon", "text:Button", "instance:Trailing icon"],
//     variant: ["instance:Icon"] }
//
// Nothing read that source. It is the hardest evidence the capture holds, since
// a child list cannot be a theming coincidence the way two colours can, and it
// named `button Emphasis=Icon-only`: the renderer drew it byte-identical to
// Filled, so asking for an icon-only button returned a labelled pill. Button is
// named by 15 UX patterns, so that reached every generated screen with one.
//
// Scope, stated because the appearance gate's own history is of overclaiming:
// this reads what the capture ALREADY recorded. A value the capture does not
// distinguish is not here, and its absence says nothing about whether the
// renderer is right. Roughly half the census has no evidence of either kind,
// and for those, fixing is guessing.

const fs = require("node:fs");
const path = require("node:path");

const C = require("./variant-collapse.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const ANATOMY_DIR = path.join(REPO_ROOT, "components", "dist", "anatomy");

function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Every (slug, prop, value) the capture records as structurally distinct, keyed
 * the way variant-collapse keys everything else. Uses C.keyFor rather than
 * rebuilding the format inline: keyFor's own note records that an inline copy
 * kept proving the old format unique after the separator changed.
 */
function structuralKeys(anatomyDir) {
  const dir = anatomyDir || ANATOMY_DIR;
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const slug = file.slice(0, -5);
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch (e) {
      // A malformed capture is a sync problem, not this module's to judge, and
      // throwing here would take the burndown down with it.
      continue;
    }
    const list = (doc.quality || {}).structuralVariants;
    if (!Array.isArray(list)) continue;
    for (const sv of list) {
      if (!sv || sv.prop == null || sv.value == null) continue;
      // The State axis is excluded everywhere else in this tier (a hover state
      // is not a different component), and excluding it here keeps one rule.
      if (C.isStateAxis(sv.prop)) continue;
      out.set(C.keyFor(slug, sv.prop, sv.value), sv);
    }
  }
  return out;
}

/**
 * The overlap: values the capture proves structurally different that the
 * renderer nonetheless draws identically to a sibling.
 *
 * Matched on the NORMALISED key, because the capture writes a prop as Figma
 * spells it and the contract writes it as the registry does; an exact-string
 * join silently returned nothing for `Size & Type` and would have reported a
 * clean zero.
 */
function unrenderedStructural(contract, exemptions, anatomyDir) {
  const structural = structuralKeys(anatomyDir);
  const byNorm = new Map();
  for (const k of structural.keys()) byNorm.set(norm(k), k);

  const collapsed = C.classify(contract, exemptions).unexplained;
  const hits = [];
  for (const key of collapsed) {
    const match = byNorm.get(norm(key));
    if (match) hits.push({ key: key, evidence: structural.get(match) });
  }
  return hits.sort(function (a, b) {
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/**
 * The ratchet's comparison, as a pure function so it can be exercised on
 * fixtures rather than only against whatever the merge base happens to hold.
 * The live check is vacuous on the commit that introduces the baseline, and a
 * gate whose only path is vacuous on the day it lands is a gate nobody has
 * seen work.
 *
 * Set difference, not a count: fixing one member while breaking another leaves
 * the count identical, and that swap is the regression a burndown reports as
 * "unchanged".
 */
function newlyBroken(before, now) {
  const was = new Set(before || []);
  return (now || []).filter(function (k) {
    return !was.has(k);
  });
}

function newlyFixed(before, now) {
  const current = new Set(now || []);
  return (before || []).filter(function (k) {
    return !current.has(k);
  });
}

module.exports = {
  structuralKeys: structuralKeys,
  unrenderedStructural: unrenderedStructural,
  newlyBroken: newlyBroken,
  newlyFixed: newlyFixed,
};
