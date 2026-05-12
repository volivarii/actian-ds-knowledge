"use strict";

// Fixture-based tests for the guideline schema. Asserts that known-good
// shapes validate and known-bad shapes produce the expected error.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const SCHEMA_PATH = path.resolve(
  __dirname,
  "..",
  "schemas",
  "guideline.json",
);
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

test("validate-guidelines CLI exits 0 on the live repo", () => {
  // Smoke test: shell out to the validator against the real repo.
  const { execFileSync } = require("node:child_process");
  const scriptPath = path.resolve(
    __dirname,
    "..",
    "scripts",
    "validate",
    "validate-guidelines.js",
  );
  // The execFileSync throws on non-zero exit. Stderr captures summary; stdout
  // captures rdjsonl. We just assert no throw.
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, [scriptPath], { stdio: "pipe" }),
  );
});
