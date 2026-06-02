#!/usr/bin/env node
"use strict";

// Validates accessibility/dist/a11y-index.json against schemas/a11y-index.json
// (the flat slug→WCAG index — distinct shape from the per-section files).
//
// Output: rdjsonl on stdout, summary on stderr. Exit 0 if clean, 1 if any violation.

const fs = require("node:fs");
const path = require("node:path");
const {
  createValidator,
  ajvErrorToRdjsonl,
  emitRdjsonl,
  emitSummary,
} = require("./lib-validator");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TARGET = path.join(REPO_ROOT, "accessibility", "dist", "a11y-index.json");

function run() {
  const records = [];
  if (!fs.existsSync(TARGET)) {
    return { invalid: 0, records, skipped: true };
  }
  const rel = path.relative(REPO_ROOT, TARGET);
  const validate = createValidator("a11y-index.json");
  let data;
  try {
    data = JSON.parse(fs.readFileSync(TARGET, "utf8"));
  } catch (e) {
    records.push({
      message: "Invalid JSON: " + e.message,
      location: { path: rel, range: { start: { line: 1, column: 1 } } },
      severity: "ERROR",
    });
    return { invalid: 1, records, skipped: false };
  }
  if (validate(data)) {
    return { invalid: 0, records, skipped: false };
  }
  for (const err of validate.errors || []) {
    records.push(ajvErrorToRdjsonl(err, rel));
  }
  return { invalid: 1, records, skipped: false };
}

function main() {
  const r = run();
  if (r.skipped) {
    emitSummary("[validate-a11y-index] SKIP — accessibility/dist/a11y-index.json not present");
    process.exit(0);
  }
  r.records.forEach(emitRdjsonl);
  emitSummary("[validate-a11y-index] " + (r.invalid === 0 ? "valid" : "INVALID"));
  process.exit(r.invalid === 0 ? 0 : 1);
}

module.exports = { run };
if (require.main === module) main();
