"use strict";
// Validates that every app-context/src/<kind>/*.md file's frontmatter
// conforms to the matching per-kind JSON schema.
//
// NOTE: terminology.yml is intentionally excluded. Its wrapper shape
// ({ _schema_version, terms: { <slug>: { use, meaning, notUse } } })
// does not match the per-term schema (which validates a standalone term
// record with slug + _schema_version). That reconciliation is deferred
// to Phase 0b.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv/dist/2020");
const { markdownToRecord } = require("../scripts/app-context/lib.js");

const ROOT = path.join(__dirname, "..");

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", name), "utf8"));
}

const ajv = new Ajv({ strict: false, allowUnionTypes: true });

// For schema validation we only need the frontmatter object.
// Entities and patterns have a prose body in the markdown (after ---), but
// the per-kind schemas validate frontmatter only ("description" is NOT a
// frontmatter field — it lives in the markdown body). So we omit bodyField
// for all kinds; markdownToRecord without bodyField returns the raw
// frontmatter map, which is exactly what the schema expects.
const KINDS = [
  {
    name: "apps",
    dir: path.join(ROOT, "app-context", "src", "apps"),
    schema: loadSchema("app-context-app.json"),
  },
  {
    name: "entities",
    dir: path.join(ROOT, "app-context", "src", "entities"),
    schema: loadSchema("app-context-entity.json"),
  },
  {
    name: "patterns",
    dir: path.join(ROOT, "app-context", "src", "patterns"),
    schema: loadSchema("app-context-pattern.json"),
  },
];

for (const kind of KINDS) {
  test(`app-context/src/${kind.name}/*.md frontmatter validates against ${kind.name} schema`, () => {
    const validate = ajv.compile(kind.schema);
    const files = fs
      .readdirSync(kind.dir)
      .filter((f) => f.endsWith(".md"))
      .sort();

    assert.ok(files.length > 0, `No .md files found in ${kind.dir}`);

    const failures = [];
    for (const file of files) {
      const text = fs.readFileSync(path.join(kind.dir, file), "utf8");
      const record = markdownToRecord(
        text,
        kind.bodyField ? { bodyField: kind.bodyField } : {},
      );
      const valid = validate(record);
      if (!valid) {
        failures.push(`${file}: ${JSON.stringify(validate.errors, null, 2)}`);
      }
    }

    assert.equal(
      failures.length,
      0,
      `${failures.length} file(s) failed validation in ${kind.name}:\n${failures.join("\n---\n")}`,
    );
  });
}
