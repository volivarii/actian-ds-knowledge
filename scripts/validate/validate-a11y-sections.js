#!/usr/bin/env node
"use strict";

// Validates every *.json under accessibility/dist/ against schemas/section.json
// (the shared per-section shape — same section-dist engine as foundations).
// Skips accessibility.bundle.json (roll-up) and a11y-index.json (own shape →
// validate-a11y-index.js). Mirrors validate-foundations-dist.js.
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
const DIST_DIR = path.join(REPO_ROOT, "accessibility", "dist");
const SKIP = new Set(["accessibility.bundle.json", "a11y-index.json"]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
    } else if (entry.name.endsWith(".json") && !SKIP.has(entry.name)) {
      out.push(abs);
    }
  }
}

function run() {
  const records = [];
  if (!fs.existsSync(DIST_DIR)) {
    return { valid: 0, invalid: 0, records, skipped: true };
  }
  const validate = createValidator("section.json");
  const files = [];
  walk(DIST_DIR, files);
  files.sort();
  let valid = 0;
  let invalid = 0;
  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch (e) {
      records.push({
        message: "Invalid JSON: " + e.message,
        location: { path: rel, range: { start: { line: 1, column: 1 } } },
        severity: "ERROR",
      });
      invalid++;
      continue;
    }
    if (validate(data)) {
      valid++;
      continue;
    }
    invalid++;
    for (const err of validate.errors || []) {
      records.push(ajvErrorToRdjsonl(err, rel));
    }
  }
  return { valid, invalid, records, skipped: false };
}

function main() {
  const r = run();
  if (r.skipped) {
    emitSummary("[validate-a11y-sections] SKIP — accessibility/dist/ not present");
    process.exit(0);
  }
  r.records.forEach(emitRdjsonl);
  emitSummary("[validate-a11y-sections] " + r.valid + " valid, " + r.invalid + " invalid");
  process.exit(r.invalid === 0 ? 0 : 1);
}

module.exports = { run };
if (require.main === module) main();
