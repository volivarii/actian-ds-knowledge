#!/usr/bin/env node
"use strict";

// Validates content/dist/words-to-avoid.json against schemas/words-to-avoid.json.
// (content/dist/global.md is markdown — no JSON schema applies.)
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
const TARGET = path.join(REPO_ROOT, "content", "dist", "words-to-avoid.json");

function run() {
  const records = [];
  if (!fs.existsSync(TARGET)) {
    return { invalid: 0, records, skipped: true };
  }
  const rel = path.relative(REPO_ROOT, TARGET);
  const validate = createValidator("words-to-avoid.json");
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
    emitSummary("[validate-content] SKIP — content/dist/words-to-avoid.json not present");
    process.exit(0);
  }
  r.records.forEach(emitRdjsonl);
  emitSummary("[validate-content] " + (r.invalid === 0 ? "valid" : "INVALID"));
  process.exit(r.invalid === 0 ? 0 : 1);
}

module.exports = { run };
if (require.main === module) main();
