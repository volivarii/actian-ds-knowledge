"use strict";

// Derives app-context section recipes: app-context/src/sections/<slug>.json
// -> app-context/dist/sections/<slug>.json, one file per slug.
//
// A section is a captured sub-page composition (an item header, a facet tab
// bar, a control bar). Page recipes reference one with
// { "type": "SECTION", "section": "<slug>" } inside skeleton.content, and
// derive-recipes.js splices the section's content in place, so consumers keep
// reading whole page skeletons. This module mirrors derive-recipes.js on
// purpose: same guards, same stamp, same prune.

const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv/dist/2020");
const { stableStringify, writeAtomic } = require("./lib");

const SCHEMA_VERSION = 1;

// True when any node under `value` is a SECTION reference. Sections are flat:
// one level of indirection keeps the derive a splice, not a resolver.
function containsSectionNode(value) {
  if (Array.isArray(value)) return value.some(containsSectionNode);
  if (!value || typeof value !== "object") return false;
  if (value.type === "SECTION") return true;
  return Object.values(value).some(containsSectionNode);
}

function readSections(srcDir, schema) {
  const dir = path.join(srcDir, "sections");
  // Same anti-prune guard as readRecipes: an absent directory is NOT "no
  // sections", because writeSections prunes every dist leaf it did not write.
  if (!fs.existsSync(dir)) {
    return {
      sections: [],
      errors: [
        dir +
          " does not exist. Refusing to treat a missing source directory as " +
          "'no sections', because the dist leaves would be pruned. Create the " +
          "directory (it may hold only a README) or remove the collection.",
      ],
    };
  }

  const ajv = new Ajv({ strict: false, allowUnionTypes: true });
  const validate = ajv.compile(schema);

  const errors = [];
  const sections = [];
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
      errors.push("sections/" + file + ": invalid JSON (" + e.message + ")");
      continue;
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      errors.push("sections/" + file + ": not a JSON object");
      continue;
    }
    if (doc.slug !== slugFromName) {
      errors.push(
        "sections/" + file + ': slug "' + doc.slug + '" != filename "' + slugFromName + '"',
      );
      continue;
    }
    if (!validate(doc)) {
      errors.push(
        "sections/" +
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
    if (containsSectionNode(doc.skeleton)) {
      errors.push(
        "sections/" +
          file +
          ": contains a SECTION node; sections are flat and may not reference sections",
      );
      continue;
    }
    sections.push(doc);
  }
  return { sections, errors };
}

function checkSectionReferences(sections, appContext) {
  const errors = [];
  const apps = new Set(Object.keys(appContext.apps || {}));
  const patterns = new Set(Object.keys(appContext.patterns || {}));
  for (const s of sections) {
    for (const a of s.apps || []) {
      if (!apps.has(a)) {
        errors.push("sections/" + s.slug + ".json: unknown app '" + a + "'");
      }
    }
    for (const p of s.patterns || []) {
      if (!patterns.has(p)) {
        errors.push("sections/" + s.slug + ".json: unknown pattern '" + p + "'");
      }
    }
  }
  return errors;
}

function writeSections(distDir, sections, meta) {
  const outDir = path.join(distDir, "sections");
  fs.mkdirSync(outDir, { recursive: true });

  const written = new Set();
  for (const s of sections) {
    const stamped = Object.assign({ _schema_version: SCHEMA_VERSION, _meta: meta }, s);
    writeAtomic(path.join(outDir, s.slug + ".json"), stableStringify(stamped));
    written.add(s.slug + ".json");
  }
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith(".json") && !written.has(f)) {
      fs.unlinkSync(path.join(outDir, f));
    }
  }
  return written.size;
}

module.exports = { readSections, checkSectionReferences, writeSections, containsSectionNode };
