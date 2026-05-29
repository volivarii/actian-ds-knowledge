#!/usr/bin/env node
"use strict";

// Validates every *.json file under foundations/dist/ against
// schemas/section.json (the generalized per-section schema, renamed from the
// former foundations-section.json — one canonical schema now; the old file no
// longer exists). Skips foundations.bundle.json (the hierarchical roll-up has
// a slightly different shape — it embeds the full tree rather than the
// per-section shape).
//
// Output: rdjsonl on stdout (one record per violation), summary on stderr.
// Exit code: 0 if all valid, 1 if any violation.

const fs = require("node:fs");
const path = require("node:path");
const {
  createValidator,
  ajvErrorToRdjsonl,
  emitRdjsonl,
  emitSummary,
} = require("./lib-validator");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DIST_DIR = path.join(REPO_ROOT, "foundations", "dist");
const SKIP = new Set([
  "foundations.bundle.json",
  // Flat index with its own shape ({_schema_version, _meta, sections:[{slug,title}]}),
  // not the per-section shape — validated by its consumer test
  // (tests/foundations-index.test.js).
  "foundations-index.json",
]);

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

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    emitSummary(
      "[validate-foundations-dist] SKIP — foundations/dist/ not present (run derive first)",
    );
    process.exit(0);
  }
  const validate = createValidator("section.json");
  const files = [];
  walk(DIST_DIR, files);
  files.sort();

  let valid = 0;
  let invalid = 0;
  let totalErrors = 0;

  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch (e) {
      emitRdjsonl({
        message: "Invalid JSON: " + e.message,
        location: { path: rel, range: { start: { line: 1, column: 1 } } },
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
    "[validate-foundations-dist] " +
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
