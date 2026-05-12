#!/usr/bin/env node
"use strict";

// Validates components/src/guidelines/*.json against schemas/guideline.json.
// Skips _index.json (different shape; validated by its own check inside
// scripts/validate-manifest.js territory).
//
// Output: rdjsonl on stdout (one record per violation), summary on stderr.
// Exit code: 0 if all valid, 1 if any violation.
//
// Usage: node scripts/validate/validate-guidelines.js [--quiet]

const fs = require("node:fs");
const path = require("node:path");
const {
  createValidator,
  ajvErrorToRdjsonl,
  emitRdjsonl,
  emitSummary,
} = require("./lib-validator");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GUIDELINES_DIR = path.join(REPO_ROOT, "components", "src", "guidelines");

function main() {
  const validate = createValidator("guideline.json");
  const files = fs
    .readdirSync(GUIDELINES_DIR)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .sort();

  let valid = 0;
  let invalid = 0;
  let totalErrors = 0;

  for (const file of files) {
    const abs = path.join(GUIDELINES_DIR, file);
    const rel = path.relative(REPO_ROOT, abs);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch (e) {
      emitRdjsonl({
        message: "Invalid JSON: " + e.message,
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

    const ok = validate(data);
    if (ok) {
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
    "[validate-guidelines] " +
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
