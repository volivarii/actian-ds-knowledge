"use strict";

// Fixture-based tests for the guideline schema. Asserts that known-good
// shapes validate and known-bad shapes produce the expected error.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const SCHEMA_PATH = path.resolve(__dirname, "..", "schemas", "guideline.json");
const FIXTURES_DIR = path.join(__dirname, "fixtures", "guidelines");

function makeValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8")));
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));
}

test("guideline schema accepts a curated component", () => {
  const validate = makeValidator();
  const ok = validate(loadFixture("valid-curated.json"));
  assert.equal(ok, true, JSON.stringify(validate.errors));
});

test("guideline schema accepts a stub component (null content fields)", () => {
  const validate = makeValidator();
  const ok = validate(loadFixture("valid-stub.json"));
  assert.equal(ok, true, JSON.stringify(validate.errors));
});

test("guideline schema rejects missing component field", () => {
  const validate = makeValidator();
  const ok = validate(loadFixture("invalid-missing-component.json"));
  assert.equal(ok, false);
  const msgs = (validate.errors || []).map((e) => e.message).join(" ");
  assert.match(msgs, /required property 'component'/);
});

test("guideline schema rejects wrong type for component", () => {
  const validate = makeValidator();
  const ok = validate(loadFixture("invalid-bad-type.json"));
  assert.equal(ok, false);
  const msgs = (validate.errors || []).map((e) => e.message).join(" ");
  assert.match(msgs, /must be string/);
});

// Phase 5 (knowledge v0.11.0): the validate-guidelines CLI smoke test was
// retired with `scripts/validate/validate-guidelines.js`. The new shape is
// validated by `scripts/validate/validate-guidelines-doc.js` against
// `schemas/guideline.json` (the fixture-based tests above). No standalone
// CLI exists for the new shape — CI workflows invoke the deriver, which
// validates inline.
