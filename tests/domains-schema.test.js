"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createValidator } = require("../scripts/validate/lib-validator");

test("domains.json validates against schemas/domains.json", () => {
  const registry = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "domains.json"), "utf8"),
  );
  const validate = createValidator("domains.json");
  const ok = validate(registry);
  assert.ok(ok, "domains.json invalid: " + JSON.stringify(validate.errors, null, 2));
});

test("registry covers the 12 expected units", () => {
  const registry = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "domains.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(registry.domains).sort(), [
    "accessibility",
    "app-context/apps",
    "app-context/entities",
    "app-context/patterns",
    "canonical-sections",
    "categories",
    "content/global",
    "content/patterns",
    "foundations",
    "graph",
    "guidelines",
    "tokens",
  ]);
});
