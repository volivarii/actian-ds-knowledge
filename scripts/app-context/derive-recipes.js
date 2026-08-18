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

module.exports = { readRecipes, checkReferences, writeRecipes };
