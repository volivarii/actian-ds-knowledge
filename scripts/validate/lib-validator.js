"use strict";

// Shared Ajv setup + reviewdog-compatible output helpers.
//
// Output format: JSON Lines, one record per violation.
// Each record matches the reviewdog `rdjsonl` format:
//   { "message": "...", "location": { "path": "...", "range": {...} },
//     "severity": "ERROR" | "WARNING" | "INFO" }
//
// We emit to stdout for downstream piping to reviewdog. Validators may also
// emit a human summary to stderr. Exit code is non-zero if any ERROR violation
// is emitted (WARNINGs do not fail CI).

const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

function loadSchema(schemaName) {
  const schemaPath = path.resolve(
    __dirname,
    "..",
    "..",
    "schemas",
    schemaName,
  );
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function createValidator(schemaName) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false, // schema has examples/description; that's fine
  });
  addFormats(ajv);
  const schema = loadSchema(schemaName);
  return ajv.compile(schema);
}

function ajvErrorToRdjsonl(err, filePath) {
  // Ajv error → reviewdog rdjsonl record.
  const instancePath = err.instancePath || "(root)";
  const message =
    err.message + (instancePath !== "" ? " at " + instancePath : "");
  return {
    message: message,
    location: {
      path: filePath,
      range: {
        // We don't have line/column info from Ajv (it operates on parsed JSON).
        // Line 1, column 1 is the conventional fallback; reviewdog will surface
        // the annotation at the top of the file with the human-readable message.
        start: { line: 1, column: 1 },
      },
    },
    severity: "ERROR",
  };
}

function emitRdjsonl(record) {
  process.stdout.write(JSON.stringify(record) + "\n");
}

function emitSummary(line) {
  process.stderr.write(line + "\n");
}

module.exports = {
  createValidator,
  ajvErrorToRdjsonl,
  emitRdjsonl,
  emitSummary,
  loadSchema,
};
