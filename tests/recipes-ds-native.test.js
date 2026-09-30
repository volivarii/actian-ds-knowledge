"use strict";
// Every page recipe is drawn with the design system and anchored to a real
// screen (#715, #716, #718, #719). Four things per recipe:
//   - it says whether its reference is the shipped product or a design;
//   - a product reference names its screenshot, and it exists in captures/;
//   - every node of its skeleton, the sections it splices in included, is a
//     design system node: a Fat Marker node (`ref: "fm..."` or `library: "fm"`)
//     draws a wireframe box where the product draws a component;
//   - its labels, the sections it splices in included, carry the product's
//     values, not {{placeholders}}.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "app-context/src/recipes");
const SECTIONS = path.join(ROOT, "app-context/src/sections");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const recipes = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => [f, read(path.join(DIR, f))]);

function nodes(n, out = []) {
  if (Array.isArray(n)) n.forEach((x) => nodes(x, out));
  else if (n && typeof n === "object") {
    if (n.type || n.dsSlug || n.ref) out.push(n);
    Object.values(n).forEach((v) => nodes(v, out));
  }
  return out;
}
// A recipe's skeleton as its dist will hold it: every SECTION node replaced by
// the section's own nodes, filled with the splice's `values`, by the derive's
// own splice. So a Fat Marker node or a placeholder inside a spliced section
// is read too, and a section value the recipe forgot is caught.
const { inlineSections } = require("../scripts/app-context/derive-recipes");
const sectionsBySlug = Object.fromEntries(
  fs
    .readdirSync(SECTIONS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => read(path.join(SECTIONS, f)))
    .map((s) => [s.slug, s]),
);
function spliced(r) {
  const { recipe, errors } = inlineSections(r, sectionsBySlug);
  assert.deepEqual(errors, []);
  return recipe.skeleton || {};
}
const tree = (r) => nodes(spliced(r));
const isFm = (n) => n.library === "fm" || /^fm/.test(n.ref || "");
// A Fat Marker node stays only where the design system has no component to
// draw it with, and each one is named here with that reason. An entry is a
// gap in the design system, not a pass: its issue tracks the missing part.
const NO_DS_COMPONENT = {
  "faceted-browse.json": {
    fmSlider: "the Completion level range facet: the design system has no slider (DS gap, #742)",
  },
};

for (const [f, r] of recipes) {
  test(f + ": says whether its reference is the product or a design", () => {
    assert.ok(["product", "design"].includes(r.reference), String(r.reference));
  });
  test(f + ": a product reference names its screenshot, and the file exists", () => {
    if (r.reference !== "product") return;
    const shot = r.derivedFrom && r.derivedFrom.screenshot;
    assert.ok(shot, "no derivedFrom.screenshot named");
    assert.ok(fs.existsSync(path.join(DIR, shot)), shot);
  });
  test(f + ": every skeleton node is a design system node", () => {
    const allowed = NO_DS_COMPONENT[f] || {};
    assert.deepEqual(
      tree(r)
        .filter(isFm)
        .map((n) => n.ref || n.name)
        .filter((ref) => !(ref in allowed)),
      [],
    );
  });
  test(f + ": no placeholder left in its labels", () => {
    const left = JSON.stringify(spliced(r)).match(/\{\{[^}]+\}\}/g) || [];
    assert.deepEqual(left, []);
  });
}

// The exception list cannot outlive its subject: an entry whose recipe no
// longer carries that node would silently allow it back later.
test("every named exception is still a node its recipe carries", () => {
  for (const [f, refs] of Object.entries(NO_DS_COMPONENT)) {
    const r = read(path.join(DIR, f));
    const present = new Set(tree(r).filter(isFm).map((n) => n.ref || n.name));
    for (const ref of Object.keys(refs)) assert.ok(present.has(ref), f + ": " + ref);
  }
});
