#!/usr/bin/env node
"use strict";

// Validates the per-component multi-domain guideline artifacts:
//   - components/src/<slug>/_meta.yml    → schemas/guideline-meta.json
//   - components/src/<slug>/tokens.yml   → schemas/guideline-tokens.json
//   - components/dist/guidelines/<slug>.json → schemas/guideline-component.json
//
// Output is rdjsonl on stdout (one record per violation); summary on stderr.
// Exit code: 0 if all valid, 1 if any violation.
//
// Usage: node scripts/validate/validate-guidelines-doc.js

const fs = require("node:fs");
const path = require("node:path");
const {
  createValidator,
  ajvErrorToRdjsonl,
  emitRdjsonl,
  emitSummary,
} = require("./lib-validator");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC_DIR = path.join(REPO_ROOT, "components", "src");
const DIST_DIR = path.join(REPO_ROOT, "components", "dist", "guidelines");
const yamlParser = require(
  path.join(REPO_ROOT, "scripts", "categories", "categories-parser"),
);

function rel(abs) {
  return path.relative(REPO_ROOT, abs).split(path.sep).join("/");
}

// A component source directory is any direct child of components/src/ that
// holds a _meta.yml (mirrors derive-guidelines.js#listComponentDirs).
function listComponentDirs() {
  if (!fs.existsSync(SRC_DIR)) return [];
  return fs
    .readdirSync(SRC_DIR)
    .filter((name) => {
      const abs = path.join(SRC_DIR, name);
      return (
        fs.statSync(abs).isDirectory() &&
        fs.existsSync(path.join(abs, "_meta.yml"))
      );
    })
    .sort();
}

function validateYamlFile(absPath, validate, counters) {
  const relPath = rel(absPath);
  let data;
  try {
    data = yamlParser.parseFrontmatter(fs.readFileSync(absPath, "utf8"), 0);
  } catch (e) {
    emitRdjsonl({
      message: "YAML parse error: " + e.message,
      location: { path: relPath, range: { start: { line: 1, column: 1 } } },
      severity: "ERROR",
    });
    counters.invalid++;
    counters.errors++;
    return;
  }
  if (validate(data)) {
    counters.valid++;
    return;
  }
  counters.invalid++;
  for (const err of validate.errors || []) {
    emitRdjsonl(ajvErrorToRdjsonl(err, relPath));
    counters.errors++;
  }
}

function validateJsonFile(absPath, validate, counters) {
  const relPath = rel(absPath);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(absPath, "utf8"));
  } catch (e) {
    emitRdjsonl({
      message: "JSON parse error: " + e.message,
      location: { path: relPath, range: { start: { line: 1, column: 1 } } },
      severity: "ERROR",
    });
    counters.invalid++;
    counters.errors++;
    return;
  }
  if (validate(data)) {
    counters.valid++;
    return;
  }
  counters.invalid++;
  for (const err of validate.errors || []) {
    emitRdjsonl(ajvErrorToRdjsonl(err, relPath));
    counters.errors++;
  }
}

function main() {
  const metaValidator = createValidator("guideline-meta.json");
  const tokensValidator = createValidator("guideline-tokens.json");
  const componentValidator = createValidator("guideline-component.json");
  const counters = { valid: 0, invalid: 0, errors: 0 };

  // Source: _meta.yml (required) + tokens.yml (optional) per component dir.
  for (const slug of listComponentDirs()) {
    const dir = path.join(SRC_DIR, slug);
    validateYamlFile(path.join(dir, "_meta.yml"), metaValidator, counters);
    const tokensAbs = path.join(dir, "tokens.yml");
    if (fs.existsSync(tokensAbs)) {
      validateYamlFile(tokensAbs, tokensValidator, counters);
    }
  }

  // Derived: components/dist/guidelines/<slug>.json (skip bundle + coverage).
  if (fs.existsSync(DIST_DIR)) {
    fs.readdirSync(DIST_DIR)
      .filter(
        (f) =>
          f.endsWith(".json") && f !== "guidelines.bundle.json",
      )
      .sort()
      .forEach((f) => {
        validateJsonFile(
          path.join(DIST_DIR, f),
          componentValidator,
          counters,
        );
      });
  }

  emitSummary(
    "[validate-guidelines-doc] " +
      counters.valid +
      " valid, " +
      counters.invalid +
      " invalid (" +
      counters.errors +
      " total errors)",
  );
  process.exit(counters.invalid === 0 ? 0 : 1);
}

if (require.main === module) main();
