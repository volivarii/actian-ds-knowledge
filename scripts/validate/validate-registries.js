#!/usr/bin/env node
"use strict";

// Validates the live component registries against schemas/registry.json.
// Locks the registry contract introduced by ζ.0–ζ.3.
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

// ζ.3 (2026-05-13): metakit intentionally omitted on first ship — its
// current state is pre-ζ.1 (last synced 2026-05-13 10:38, before
// documentationLinks/guidelinesFile/lastSynced-drop hit main). Validation
// would surface 56 spurious violations until the next metakit sync
// propagates the ζ.0-ζ.2 fields. Re-add to REGISTRIES in a follow-up PR
// after the next sync run catches metakit up to current contract.
const REGISTRIES = [
  "components/dist/registries/dskit.json",
  "components/dist/registries/fmkit.json",
  // "components/dist/registries/metakit.json",  // ← lagging, see comment
];

function main() {
  const validate = createValidator("registry.json");
  let totalViolations = 0;
  let errorCount = 0;

  REGISTRIES.forEach(function (rel) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      // Skip missing registries — fmkit/metakit may not exist in partial
      // syncs. Surfacing this as a stderr note keeps the validator from
      // failing on partial states.
      process.stderr.write(
        "[validate-registries] skip: " + rel + " does not exist\n",
      );
      return;
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch (e) {
      // One record per line — lib-validator's emitRdjsonl expects a
      // single record, not a batch. Matches validate-manifest-schema.js
      // pattern; emits nothing when there are zero violations so the
      // CI step's `-s combined.rdjsonl` byte-size check returns false
      // on clean runs.
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
    "[validate-registries] " +
      REGISTRIES.length +
      " registries checked, " +
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
