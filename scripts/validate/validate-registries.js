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

// Derived from the deriver's list minus a NAMED exclusion, rather than restated.
// The shapes differ in the direction of their failure: an inclusion list silently
// omits a kit nobody remembered to add, while an exclusion list validates a new
// kit by default and has to be told not to. Only the second is safe here.
const LAGGING = [
  // ζ.3 (2026-05-13): metakit's state is pre-ζ.1 (last synced 2026-05-13 10:38,
  // before documentationLinks/guidelinesFile/lastSynced-drop hit main), so
  // validating it would surface 56 spurious violations. Drop this entry once a
  // sync run catches metakit up to the current contract.
  "components/dist/registries/metakit.json",
];
// The leaf list, NOT via derive-graph: this script runs under continue-on-error
// and its empty output reads as "all schemas valid", so a require-time throw
// anywhere in the deriver's module graph would be a false all-clear.
const ALL_REGISTRIES = require("../lib/registry-files.js");
// Every exclusion must name a path that actually exists in the list.
//
// Two ways it goes stale, and the message has to cover both because they are
// opposite situations: a RENAME leaves LAGGING matching nothing and the kit gets
// validated for the first time (failing with its known-spurious violations,
// pointing the author at the registry rather than the exclusion); a RETIREMENT
// removes the kit entirely, so nothing is being validated and the only fix is to
// drop the LAGGING entry too. The union gate tells a retiring author to remove
// the kit from registry-files.js, so this must not then accuse them of
// un-excluding it.
const STALE_EXCLUSIONS = LAGGING.filter((rel) => !ALL_REGISTRIES.includes(rel));

const REGISTRIES = ALL_REGISTRIES.filter((rel) => !LAGGING.includes(rel));

function main() {
  if (STALE_EXCLUSIONS.length) {
    emitRdjsonl({
      message:
        "LAGGING names paths that are not in scripts/lib/registry-files.js: " +
        STALE_EXCLUSIONS.join(", ") +
        " — an exclusion can only skip a kit that is in the list. Either the path" +
        " was renamed there (update LAGGING to match, or that kit is now being" +
        " validated for the first time), or the kit was retired (delete its" +
        " LAGGING entry in the same change).",
      location: {
        path: "scripts/validate/validate-registries.js",
        range: { start: { line: 1, column: 1 } },
      },
      severity: "ERROR",
    });
    // Summary too: every other exit path writes one, and without it this failure
    // shows an empty step log (stdout is redirected to registries.rdjsonl).
    emitSummary(
      "[validate-registries] stale LAGGING entries: " +
        STALE_EXCLUSIONS.join(", "),
    );
    process.exit(1);
  }
  const validate = createValidator("registry.json");
  let totalViolations = 0;
  let errorCount = 0;
  let validatedCount = 0;

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
    validatedCount++;
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

  // Non-vacuity on what was ACTUALLY validated, not on the length of the list.
  //
  // 🚨 The earlier version of this guard checked `REGISTRIES.length === 0` at
  // load time, which the skip-if-missing branch above walks straight past: with
  // every registry absent on disk it printed "2 registries checked, 0 violations",
  // wrote nothing to stdout, and exited 0 — a green schema gate that validated
  // nothing, which is exactly the false all-clear the guard exists to prevent.
  // The count in the summary lied for the same reason.
  // Fires on a PARTIAL absence too, not only a total one. The skip-if-missing
  // branch above swallows each missing registry individually, so with dskit gone
  // and fmkit present this printed "1 registries checked, 0 violations", wrote
  // nothing to stdout, and exited 0 -- the largest kit unvalidated behind a green
  // schema check. Same false all-clear as the empty case, one registry short.
  if (validatedCount < REGISTRIES.length && errorCount === 0) {
    emitRdjsonl({
      message:
        "only " +
        validatedCount +
        " of " +
        REGISTRIES.length +
        " registries were validated; the rest are missing on disk. A registry that is not read is not checked, and this step's empty output would otherwise read as 'all schemas valid'.",
      location: {
        path: "scripts/validate/validate-registries.js",
        range: { start: { line: 1, column: 1 } },
      },
      severity: "ERROR",
    });
    errorCount++;
    // Counted as a violation too: it IS one, and a summary reading
    // "0 violations (1 errors)" contradicts the rdjsonl record that decides
    // the job -- the misleading-summary problem this block is written against.
    totalViolations++;
  }

  emitSummary(
    "[validate-registries] " +
      validatedCount +
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
