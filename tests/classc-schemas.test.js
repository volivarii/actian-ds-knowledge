"use strict";

// D3 from R6 pre-build deltas: structural validation of the three Class C
// (hand-maintained) JSONs against their newly-introduced JSON Schemas.
//
// Each Class C file already ships with a `_schema_version: 1` field; D4
// adds a structured `_regen` provenance block. These tests pin both the
// schema's structural validity (compiles cleanly) and the live file's
// conformance.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const ROOT = path.resolve(__dirname, "..");

function compileSchema(schemaRelPath) {
  const schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, schemaRelPath), "utf8"),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return { validate: ajv.compile(schema), schema };
}

function validateFile(schemaRelPath, dataRelPath) {
  const { validate } = compileSchema(schemaRelPath);
  const data = JSON.parse(
    fs.readFileSync(path.join(ROOT, dataRelPath), "utf8"),
  );
  const ok = validate(data);
  if (!ok) {
    throw new Error(
      path.basename(dataRelPath) +
        " does not validate against " +
        path.basename(schemaRelPath) +
        ":\n" +
        JSON.stringify(validate.errors, null, 2),
    );
  }
  return true;
}

test("D3 — schemas/app-context.json validates app-context/app-context.json", () => {
  assert.equal(
    validateFile("schemas/app-context.json", "app-context/app-context.json"),
    true,
  );
});

test("D3 — schemas/fm-to-ds-map.json validates fm-to-ds-map/fm-to-ds-map.json", () => {
  assert.equal(
    validateFile("schemas/fm-to-ds-map.json", "fm-to-ds-map/fm-to-ds-map.json"),
    true,
  );
});

test("D3 — schemas/icon-groups.json validates components/src/icon-groups.json", () => {
  assert.equal(
    validateFile("schemas/icon-groups.json", "components/src/icon-groups.json"),
    true,
  );
});
