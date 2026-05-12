#!/usr/bin/env node
"use strict";

// Validates paths-manifest.json against schemas/manifest.json.
// Complements (does not replace) scripts/validate-manifest.js, which checks
// path resolution + orphan coverage; this one checks the structural shape.
//
// Output: rdjsonl on stdout (one record per violation), summary on stderr.
// Exit code: 0 if valid, 1 if invalid.

const fs = require("node:fs");
const path = require("node:path");
const {
  createValidator,
  ajvErrorToRdjsonl,
  emitRdjsonl,
  emitSummary,
} = require("./lib-validator");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "paths-manifest.json");

function main() {
  const validate = createValidator("manifest.json");
  const rel = "paths-manifest.json";

  let data;
  try {
    data = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch (e) {
    emitRdjsonl({
      message: "Invalid JSON: " + e.message,
      location: { path: rel, range: { start: { line: 1, column: 1 } } },
      severity: "ERROR",
    });
    emitSummary("[validate-manifest-schema] FAIL — invalid JSON");
    process.exit(1);
  }

  const ok = validate(data);
  if (ok) {
    emitSummary("[validate-manifest-schema] OK");
    process.exit(0);
  }
  for (const err of validate.errors || []) {
    emitRdjsonl(ajvErrorToRdjsonl(err, rel));
  }
  emitSummary(
    "[validate-manifest-schema] FAIL — " +
      (validate.errors || []).length +
      " violations",
  );
  process.exit(1);
}

if (require.main === module) main();
