#!/usr/bin/env node
"use strict";

// Semantic gate for the color-preserving graphics/artwork read-surface
// (components/dist/graphics/graphics.json). JSON Schema (schemas/graphics.json)
// checks shape; this checks content the schema cannot express: viewBox and
// body must be non-empty strings, and body must not carry an EXTERNAL
// resource reference.
//
// An INTERNAL fragment reference is legal SVG and MUST be accepted: real
// Figma artwork (the pyramid) uses url(#gradient) for its gradient fill, and
// future artwork may use <use href="#part">. Rejecting those would break
// legitimate multicolor artwork, not protect against anything.
//
// External means: a `src=` attribute (raster fallback), an `@import` (CSS
// pulling in an external stylesheet), or an `href`/`xlink:href` whose value
// does NOT start with "#" (a reference to a file or URL rather than a
// same-document fragment). Deliberately do NOT fall back to rejecting the
// bare substring "href=", since that would also flag the legal href="#id" /
// <use href="#part"> case, which is exactly the artwork this tier ships.

const fs = require("node:fs");
const path = require("node:path");

// A quote immediately followed by "#" is an internal fragment ref and is
// excluded by the negative lookahead; anything else after the (optional
// xlink:) href= is external.
const EXTERNAL_HREF_RE = /(?:xlink:)?href\s*=\s*["'](?!#)/i;
const SRC_ATTR_RE = /\bsrc\s*=\s*["']/i;
const IMPORT_RE = /@import\b/i;

// validateGraphics(json): json is a slug -> {viewBox, body} map (the
// `graphics` payload, not the whole dist envelope with _schema_version/_meta).
// Returns { ok, errors }.
function validateGraphics(json) {
  const errors = [];
  const entries = json || {};

  for (const slug of Object.keys(entries)) {
    const entry = entries[slug] || {};

    if (typeof entry.viewBox !== "string" || entry.viewBox.trim() === "") {
      errors.push(slug + ": viewBox must be a non-empty string");
    }

    if (typeof entry.body !== "string" || entry.body.trim() === "") {
      errors.push(slug + ": body must be a non-empty string");
      continue; // nothing further to check on a missing/empty body
    }

    if (SRC_ATTR_RE.test(entry.body)) {
      errors.push(
        slug + ": body contains an external reference (src= attribute)",
      );
    }
    if (IMPORT_RE.test(entry.body)) {
      errors.push(slug + ": body contains an external reference (@import)");
    }
    if (EXTERNAL_HREF_RE.test(entry.body)) {
      errors.push(
        slug +
          ": body contains an external reference (href/xlink:href not " +
          "starting with #)",
      );
    }
  }

  return { ok: errors.length === 0, errors: errors };
}

function main() {
  const target =
    process.argv[2] ||
    path.join(
      __dirname,
      "..",
      "..",
      "components",
      "dist",
      "graphics",
      "graphics.json",
    );

  if (!fs.existsSync(target)) {
    console.error("[validate-graphics] file not found: " + target);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(target, "utf8"));
  const graphics = json.graphics || json;
  const result = validateGraphics(graphics);

  if (result.ok) {
    console.log(
      "[validate-graphics] OK: " +
        Object.keys(graphics).length +
        " graphics, no external references",
    );
    process.exit(0);
  }

  console.error(
    "[validate-graphics] FAILED with " + result.errors.length + " errors:",
  );
  for (const err of result.errors) {
    console.error("  - " + err);
  }
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { validateGraphics };
