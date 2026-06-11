#!/usr/bin/env node
"use strict";

// Validates every components/dist/anatomy/*.json against schemas/anatomy.json.
// Mirrors the structure of validate-registries.js.
//
// Output: rdjsonl on stdout (one record per violation), summary on stderr.
// Exit code: 0 if valid or anatomy dir absent, 1 if any validation error.

const fs = require("node:fs");
const path = require("node:path");
const {
  createValidator,
  ajvErrorToRdjsonl,
  emitRdjsonl,
  emitSummary,
} = require("./lib-validator");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ANATOMY_DIR = path.join(REPO_ROOT, "components", "dist", "anatomy");

function main() {
  if (!fs.existsSync(ANATOMY_DIR)) {
    process.stderr.write(
      "[validate-anatomy] anatomy dir does not exist yet (" +
        path.relative(REPO_ROOT, ANATOMY_DIR) +
        ") — skipping (no artifacts to validate)\n",
    );
    process.exit(0);
  }

  const files = fs
    .readdirSync(ANATOMY_DIR)
    .filter(function (f) {
      return f.endsWith(".json");
    })
    .sort();

  if (files.length === 0) {
    process.stderr.write(
      "[validate-anatomy] 0 anatomy files found — skipping (no artifacts to validate)\n",
    );
    process.exit(0);
  }

  const validate = createValidator("anatomy.json");
  let totalViolations = 0;
  let errorCount = 0;

  files.forEach(function (filename) {
    const rel = path.join("components", "dist", "anatomy", filename);
    const abs = path.join(ANATOMY_DIR, filename);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch (e) {
      emitRdjsonl({
        message: "JSON parse failed: " + e.message,
        location: { path: rel, range: { start: { line: 1, column: 1 } } },
        severity: "ERROR",
      });
      totalViolations++;
      errorCount++;
      return;
    }
    const ok = validate(data);
    if (!ok) {
      (validate.errors || []).forEach(function (err) {
        const record = ajvErrorToRdjsonl(err, rel);
        emitRdjsonl(record);
        totalViolations++;
        if (record.severity === "ERROR") errorCount++;
      });
    }
  });

  emitSummary(
    "[validate-anatomy] " +
      files.length +
      " anatomy files checked, " +
      totalViolations +
      " violations (" +
      errorCount +
      " errors)",
  );

  process.exit(errorCount > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}
