"use strict";

// Structural + style tests for the JSON Schemas in schemas/.
// Structural: every schema is a valid JSON Schema draft-2020-12.
// Style: every schema has required + properties; every property carries
//        description + at least one example (the "useful for docs site +
//        AI agents" guarantee).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const SCHEMAS_DIR = path.resolve(__dirname, "..", "schemas");

function listSchemaFiles() {
  return fs
    .readdirSync(SCHEMAS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(SCHEMAS_DIR, f));
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Recursively visit every named property in a schema, calling visit(propName, propSchema).
// Walks properties + $defs + nested object/array items.
function visitProperties(schema, visit) {
  function walk(node, contextPath) {
    if (!node || typeof node !== "object") return;
    if (node.properties) {
      for (const [name, propSchema] of Object.entries(node.properties)) {
        visit(name, propSchema, contextPath);
        walk(propSchema, contextPath + "." + name);
      }
    }
    if (node.$defs) {
      for (const def of Object.values(node.$defs)) walk(def, contextPath);
    }
    if (node.items) walk(node.items, contextPath + "[]");
    if (Array.isArray(node.anyOf))
      node.anyOf.forEach((s) => walk(s, contextPath));
    if (Array.isArray(node.oneOf))
      node.oneOf.forEach((s) => walk(s, contextPath));
    if (Array.isArray(node.allOf))
      node.allOf.forEach((s) => walk(s, contextPath));
  }
  walk(schema, schema.title || "(root)");
}

test("every schema file is a valid JSON Schema draft-2020-12", () => {
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const files = listSchemaFiles();
  assert.ok(files.length >= 4, "expected at least 4 schema files");
  for (const file of files) {
    const schema = loadJson(file);
    assert.equal(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
      path.basename(file) + " must declare $schema draft 2020-12",
    );
    // Compiling exercises the structural validity.
    assert.doesNotThrow(() => ajv.compile(schema), path.basename(file));
  }
});

test("every schema declares title + description", () => {
  for (const file of listSchemaFiles()) {
    const schema = loadJson(file);
    assert.ok(schema.title, path.basename(file) + " missing title");
    assert.ok(schema.description, path.basename(file) + " missing description");
  }
});

test("every property in every schema has description + examples", () => {
  const missing = [];
  for (const file of listSchemaFiles()) {
    const schema = loadJson(file);
    visitProperties(schema, (name, prop, ctx) => {
      // Allow $defs internals to skip (they're referenced via $ref).
      if (name.startsWith("$")) return;
      // Properties without nested schemas (e.g. boolean constants) — skip examples
      // requirement on `const`-only nodes since the const itself documents the value.
      if (prop.const !== undefined) return;
      if (!prop.description) {
        missing.push(
          path.basename(file) +
            " · " +
            ctx +
            "." +
            name +
            " missing description",
        );
      }
      if (!Array.isArray(prop.examples)) {
        missing.push(
          path.basename(file) + " · " + ctx + "." + name + " missing examples",
        );
      }
    });
  }
  assert.equal(
    missing.length,
    0,
    "Properties missing description/examples:\n  " + missing.join("\n  "),
  );
});

test("at least one schema property uses pattern + examples (sanity)", () => {
  let found = false;
  for (const file of listSchemaFiles()) {
    const schema = loadJson(file);
    visitProperties(schema, (_name, prop) => {
      if (
        prop.pattern &&
        Array.isArray(prop.examples) &&
        prop.examples.length > 0
      ) {
        found = true;
      }
    });
  }
  assert.ok(
    found,
    "expected at least one pattern+examples property across schemas",
  );
});

// ───────────────────────────────────────────────────────────────────────────
// _meta.yml — accept/reject cases for the optional discovery fields
// (related, examples, lastReviewed). The schema's structural validity is
// covered by the loop above; these tests pin the data-shape contract.
// ───────────────────────────────────────────────────────────────────────────

function newMetaValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const metaSchema = loadJson(path.join(SCHEMAS_DIR, "guideline-meta.json"));
  return ajv.compile(metaSchema);
}

function validMetaBase() {
  return {
    component: "Button",
    category: "action",
    domains: {
      content: { status: "approved" },
      usage: { status: "not-started" },
      design: { status: "inherited" },
      behavior: { status: "inherited" },
      tokens: { status: "not-started" },
    },
  };
}

test("_meta.yml accepts optional related: [slug, ...]", () => {
  const validate = newMetaValidator();
  const doc = Object.assign(validMetaBase(), {
    related: ["link", "icon-button"],
  });
  const ok = validate(doc);
  assert.ok(ok, JSON.stringify(validate.errors));
});

test("_meta.yml accepts optional examples: [{label, figmaNode|url}]", () => {
  const validate = newMetaValidator();
  const doc = Object.assign(validMetaBase(), {
    examples: [
      { label: "Primary button", figmaNode: "302:5142" },
      { label: "Documentation page", url: "https://docs.example/button" },
    ],
  });
  const ok = validate(doc);
  assert.ok(ok, JSON.stringify(validate.errors));
});

test("_meta.yml accepts optional lastReviewed: YYYY-MM-DD", () => {
  const validate = newMetaValidator();
  const doc = Object.assign(validMetaBase(), { lastReviewed: "2026-05-15" });
  const ok = validate(doc);
  assert.ok(ok, JSON.stringify(validate.errors));
});

test("_meta.yml rejects malformed lastReviewed", () => {
  const validate = newMetaValidator();
  const doc = Object.assign(validMetaBase(), { lastReviewed: "May 15, 2026" });
  const ok = validate(doc);
  assert.equal(ok, false);
});

test("_meta.yml rejects examples entry missing label", () => {
  const validate = newMetaValidator();
  const doc = Object.assign(validMetaBase(), {
    examples: [{ figmaNode: "302:5142" }],
  });
  const ok = validate(doc);
  assert.equal(ok, false);
});

test("_meta.yml accepts a minimal doc with none of the three new optional fields", () => {
  const validate = newMetaValidator();
  const ok = validate(validMetaBase());
  assert.ok(ok, JSON.stringify(validate.errors));
});
