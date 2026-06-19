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

test("D3 — schemas/app-context.json validates app-context/dist/app-context.json", () => {
  assert.equal(
    validateFile(
      "schemas/app-context.json",
      "app-context/dist/app-context.json",
    ),
    true,
  );
});

test("D3 — schemas/icon-groups.json validates components/src/icon-groups.json", () => {
  assert.equal(
    validateFile("schemas/icon-groups.json", "components/src/icon-groups.json"),
    true,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Negative boundary tests — pin the load-bearing constraints the Knowledge
// Editor's secondary tier will rely on. If any of these flip, the editor
// could silently accept malformed authoring.
// ───────────────────────────────────────────────────────────────────────────

test("D3 — schemas/icons-svg.json validates components/src/icons-svg.json", () => {
  assert.equal(
    validateFile("schemas/icons-svg.json", "components/src/icons-svg.json"),
    true,
  );
});

test("icons-svg rejects an icon missing the required body", () => {
  const { validate } = compileSchema("schemas/icons-svg.json");
  const bad = {
    _schema_version: 1,
    icons: { close: { viewBox: "0 0 20 20" } }, // body missing
  };
  assert.equal(validate(bad), false, "icon without body should reject");
});

test("D3 — icon-groups rejects an uppercase icon slug inside a group", () => {
  const { validate } = compileSchema("schemas/icon-groups.json");
  const bad = {
    _schema_version: 1,
    Status: ["valid-slug", "Invalid_Slug"],
  };
  assert.equal(validate(bad), false, "uppercase/underscore slug should reject");
});

test("D3 — app-context rejects an entity missing the required relationships field", () => {
  const { validate } = compileSchema("schemas/app-context.json");
  const bad = {
    _schema_version: 1,
    apps: {},
    entities: {
      "data-product": {
        label: "Data Product",
        description: "Curated asset",
        properties: ["name"],
        apps: ["studio"],
        // relationships intentionally missing
      },
    },
    terminology: {},
    patterns: {},
  };
  assert.equal(
    validate(bad),
    false,
    "entity missing relationships should reject",
  );
});
