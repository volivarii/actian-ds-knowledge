"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { validateAppContext } = require("../scripts/app-context/validate-app-context");
const { deriveToObject } = require("../scripts/app-context/derive-app-context");

test("a dangling relationship target is reported", () => {
  const bad = { apps: {}, entities: { a: { relationships: { rel: "ghost" }, apps: [] } }, patterns: {}, terminology: {} };
  const { errors } = validateAppContext(bad);
  assert.ok(errors.some((e) => e.includes("ghost")), errors.join("\n"));
});

test("the real derived dist has ZERO integrity errors (post-fix)", () => {
  const dist = deriveToObject(path.resolve(__dirname, "..", "app-context", "src"));
  const { errors } = validateAppContext(dist);
  assert.deepEqual(errors, [], "fix dangling refs in app-context/src before this passes:\n" + errors.join("\n"));
});
