import { test } from "node:test";
import assert from "node:assert/strict";
import { SchemaValidationError } from "../../src/core/types";

test("detail() formats AJV instancePath + message", () => {
  const err = new SchemaValidationError("components/src/x/_meta.yml", [
    { instancePath: "/category", message: 'must match pattern "^[a-z]"' },
    { instancePath: "/a11y_refs", message: "must NOT have fewer than 1 items" },
  ]);
  assert.equal(
    err.detail(),
    '/category must match pattern "^[a-z]"; /a11y_refs must NOT have fewer than 1 items',
  );
});

test("detail() formats the validator's own no-schema message (no instancePath)", () => {
  const err = new SchemaValidationError("components/src/x/_meta.yml", [
    { message: 'no schema loaded for key "guideline-meta"' },
  ]);
  assert.equal(err.detail(), 'no schema loaded for key "guideline-meta"');
});

test("detail() returns empty string when there are no errors", () => {
  const err = new SchemaValidationError("p", []);
  assert.equal(err.detail(), "");
});
