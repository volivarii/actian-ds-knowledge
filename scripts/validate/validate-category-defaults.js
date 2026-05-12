#!/usr/bin/env node
"use strict";

// Validates the YAML frontmatter of components/src/categories/*.md against
// schemas/category-defaults.json. Output is rdjsonl on stdout (one record per
// violation); summary on stderr. Exit code: 0 if all valid, 1 if any violation.
//
// Skips AUTHORING.md (not a category MD).
//
// Usage: node scripts/validate/validate-category-defaults.js

const fs = require("node:fs");
const path = require("node:path");
const {
  createValidator,
  ajvErrorToRdjsonl,
  emitRdjsonl,
  emitSummary,
} = require("./lib-validator");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CATEGORIES_DIR = path.join(REPO_ROOT, "components", "src", "categories");
const parser = require(path.join(REPO_ROOT, "scripts", "categories", "categories-parser"));

function main() {
  if (!fs.existsSync(CATEGORIES_DIR)) {
    emitSummary(
      "[validate-category-defaults] no categories dir at " +
        CATEGORIES_DIR +
        "; skipping",
    );
    process.exit(0);
  }
  const validate = createValidator("category-defaults.json");
  const files = fs
    .readdirSync(CATEGORIES_DIR)
    .filter((f) => f.endsWith(".md") && f !== "AUTHORING.md")
    .sort();

  let valid = 0;
  let invalid = 0;
  let totalErrors = 0;

  for (const file of files) {
    const abs = path.join(CATEGORIES_DIR, file);
    const rel = path.relative(REPO_ROOT, abs);
    const src = fs.readFileSync(abs, "utf8");

    let parsed;
    try {
      parsed = parser.parse(src);
    } catch (e) {
      emitRdjsonl({
        message: "YAML frontmatter parse error: " + e.message,
        location: {
          path: rel,
          range: { start: { line: 1, column: 1 } },
        },
        severity: "ERROR",
      });
      invalid++;
      totalErrors++;
      continue;
    }

    const ok = validate(parsed.data);
    if (ok) {
      // Filename ↔ slug sanity check (not in schema; only checked at derive
      // time but the validator should surface it too).
      const expectedSlug = file.replace(/\.md$/, "");
      if (parsed.data.slug !== expectedSlug) {
        emitRdjsonl({
          message:
            "Filename/slug mismatch: file '" +
            file +
            "' but frontmatter slug is '" +
            parsed.data.slug +
            "'.",
          location: {
            path: rel,
            range: { start: { line: 1, column: 1 } },
          },
          severity: "ERROR",
        });
        invalid++;
        totalErrors++;
        continue;
      }
      valid++;
      continue;
    }

    invalid++;
    for (const err of validate.errors || []) {
      emitRdjsonl(ajvErrorToRdjsonl(err, rel));
      totalErrors++;
    }
  }

  emitSummary(
    "[validate-category-defaults] " +
      valid +
      " valid, " +
      invalid +
      " invalid (" +
      totalErrors +
      " total errors)",
  );
  process.exit(invalid === 0 ? 0 : 1);
}

if (require.main === module) main();
