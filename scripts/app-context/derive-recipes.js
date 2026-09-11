"use strict";

// Derives app-context page recipes: app-context/src/recipes/<slug>.json
// -> app-context/dist/recipes/<slug>.json, one file per slug.
//
// Per-slug rather than folded into app-context.json on purpose. That file is
// consumed WHOLE, and a single recipe is already >1400 lines; with one recipe
// per page archetype, folding them in would make every consumer of app-context
// pay for every archetype in order to read any one of them. Same shape as
// components.anatomy.byKey, and it routes through the {slug} collection
// machinery every other per-thing document here already uses.

const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv/dist/2020");
const { stableStringify, writeAtomic } = require("./lib");

const SCHEMA_VERSION = 1;

function readRecipes(srcDir, schema) {
  const dir = path.join(srcDir, "recipes");
  // 🚨 An absent directory is NOT "no recipes". writeRecipes prunes every dist
  // leaf this run did not write, so returning an empty list here turned a bad
  // rebase or a sparse checkout into a silent full wipe that printed
  // "derived app-context recipes: 0" and exited 0. Same shape as the anatomy
  // prune that deleted 179 committed files. Unknown must not read as absent.
  if (!fs.existsSync(dir)) {
    return {
      recipes: [],
      errors: [
        dir +
          " does not exist. Refusing to treat a missing source directory as " +
          "'no recipes', because the dist leaves would be pruned. Create the " +
          "directory (it may hold only a README) or remove the collection.",
      ],
    };
  }

  const ajv = new Ajv({ strict: false, allowUnionTypes: true });
  const validate = ajv.compile(schema);

  const errors = [];
  const recipes = [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  for (const file of files) {
    const slugFromName = file.replace(/\.json$/, "");
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch (e) {
      errors.push("recipes/" + file + ": invalid JSON (" + e.message + ")");
      continue;
    }
    // JSON.parse succeeds on `null`, `123` and `[]`, none of which has a slug.
    // Without this the dereference below throws an uncaught TypeError and takes
    // the whole derive with it, instead of the per-file error line intended.
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      errors.push("recipes/" + file + ": not a JSON object");
      continue;
    }
    // Same guard the pattern/app/entity kinds enforce: the filename IS the id.
    if (doc.slug !== slugFromName) {
      errors.push(
        "recipes/" +
          file +
          ': slug "' +
          doc.slug +
          '" != filename "' +
          slugFromName +
          '"',
      );
      continue;
    }
    if (!validate(doc)) {
      errors.push(
        "recipes/" +
          file +
          ": schema errors: " +
          (validate.errors || [])
            .map(function (e) {
              return (e.instancePath || "/") + " " + e.message;
            })
            .join("; "),
      );
      continue;
    }
    recipes.push(doc);
  }
  return { recipes, errors };
}

// Cross-domain integrity: a recipe must name apps and patterns that exist.
// Without this a recipe drifts from the substrate silently, which is the
// failure this domain exists to stop.
function checkReferences(recipes, appContext) {
  const errors = [];
  const apps = new Set(Object.keys(appContext.apps || {}));
  const patterns = new Set(Object.keys(appContext.patterns || {}));
  for (const r of recipes) {
    for (const a of r.apps || []) {
      if (!apps.has(a)) {
        errors.push("recipes/" + r.slug + ".json: unknown app '" + a + "'");
      }
    }
    for (const p of r.patterns || []) {
      if (!patterns.has(p)) {
        errors.push("recipes/" + r.slug + ".json: unknown pattern '" + p + "'");
      }
    }
  }
  return errors;
}

function writeRecipes(distDir, recipes, meta) {
  const outDir = path.join(distDir, "recipes");
  fs.mkdirSync(outDir, { recursive: true });

  const written = new Set();
  for (const r of recipes) {
    const stamped = Object.assign(
      { _schema_version: SCHEMA_VERSION, _meta: meta },
      r,
    );
    writeAtomic(path.join(outDir, r.slug + ".json"), stableStringify(stamped));
    written.add(r.slug + ".json");
  }
  // Drop dist leaves whose source is gone, so a deleted recipe cannot linger.
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith(".json") && !written.has(f)) {
      fs.unlinkSync(path.join(outDir, f));
    }
  }
  return written.size;
}

// Replaces every { type: "SECTION", section } element of a content[] or
// children[] array with deep clones of that section's skeleton.content[], so
// the dist recipe keeps the whole-skeleton shape every consumer reads today.
// Records the slugs inlined, in document order, as `sections` on the result.
// The input recipe is not mutated. A SECTION object anywhere other than as an
// array element under content/children is an error: the splice has no
// meaning there.
function inlineSections(recipe, sectionsBySlug) {
  const errors = [];
  const used = [];
  const where = "recipes/" + recipe.slug + ".json";

  function walk(value, label, spliceable) {
    if (Array.isArray(value)) {
      const out = [];
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (v && typeof v === "object" && !Array.isArray(v) && v.type === "SECTION") {
          if (!spliceable) {
            errors.push(
              where + ": SECTION node at " + label + "/" + i +
                " is not an element of content[] or children[]",
            );
            continue;
          }
          const section = sectionsBySlug[v.section];
          if (!section) {
            errors.push(where + ": unknown section '" + v.section + "'");
            continue;
          }
          used.push(v.section);
          for (const node of section.skeleton.content) {
            out.push(JSON.parse(JSON.stringify(node)));
          }
          continue;
        }
        out.push(walk(v, label + "/" + i, false));
      }
      return out;
    }
    if (!value || typeof value !== "object") return value;
    if (value.type === "SECTION") {
      errors.push(
        where + ": SECTION node at " + label +
          " is not an element of content[] or children[]",
      );
      return JSON.parse(JSON.stringify(value));
    }
    const copy = {};
    for (const [k, v] of Object.entries(value)) {
      copy[k] = walk(v, label + "/" + k, k === "content" || k === "children");
    }
    return copy;
  }

  const skeleton = walk(recipe.skeleton, "skeleton", false);
  // Every field, not only skeleton, must share nothing with the input: a
  // caller reading recipe.derivedFrom or recipe.slots off the input after
  // this call must not see a write made through the returned recipe.
  const out = JSON.parse(JSON.stringify(recipe));
  out.skeleton = skeleton;
  out.sections = used;
  return { recipe: out, errors };
}

module.exports = { readRecipes, checkReferences, writeRecipes, inlineSections };
