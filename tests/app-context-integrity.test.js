"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  validateAppContext,
} = require("../scripts/app-context/validate-app-context");
const { deriveToObject } = require("../scripts/app-context/derive-app-context");

test("a dangling relationship target is reported", () => {
  const bad = {
    apps: {},
    entities: { a: { relationships: { rel: "ghost" }, apps: [] } },
    patterns: {},
    terminology: {},
  };
  const { errors } = validateAppContext(bad);
  assert.ok(
    errors.some((e) => e.includes("ghost")),
    errors.join("\n"),
  );
});

test("the real derived dist has ZERO integrity errors (post-fix)", () => {
  const dist = deriveToObject(
    path.resolve(__dirname, "..", "app-context", "src"),
  );
  const { errors } = validateAppContext(dist);
  assert.deepEqual(
    errors,
    [],
    "fix dangling refs in app-context/src before this passes:\n" +
      errors.join("\n"),
  );
});

test("useCases.patterns must exist and be scoped to the app", () => {
  // `explorer` is declared so the pre-existing pattern.apps integrity check
  // doesn't fire on p-explorer; this isolates the useCases checks under test.
  const base = {
    apps: {
      studio: {
        useCases: [{ audience: ["s"], jobs: ["j"], patterns: ["p-studio"] }],
      },
      explorer: { useCases: [] },
    },
    entities: {},
    patterns: {
      "p-studio": { apps: ["studio"] },
      "p-explorer": { apps: ["explorer"] },
    },
  };
  assert.deepEqual(validateAppContext(base).errors, []);

  const unknown = {
    ...base,
    apps: {
      ...base.apps,
      studio: {
        useCases: [{ audience: ["s"], jobs: ["j"], patterns: ["nope"] }],
      },
    },
  };
  assert.equal(validateAppContext(unknown).errors.length, 1);

  const cross = {
    ...base,
    apps: {
      ...base.apps,
      studio: {
        useCases: [{ audience: ["s"], jobs: ["j"], patterns: ["p-explorer"] }],
      },
    },
  };
  assert.match(validateAppContext(cross).errors[0], /not scoped to app/);
});
