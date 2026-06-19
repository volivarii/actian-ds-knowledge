"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { deriveToObject } = require("../scripts/app-context/derive-app-context");

const ROOT = path.resolve(__dirname, "..");
const srcDir = path.join(ROOT, "app-context", "src");

test("derive(src) deep-equals the committed dist (round-trip drift gate)", () => {
  // PR #273 convention: committed dist is the snapshot; re-derive must reproduce it.
  const derived = deriveToObject(srcDir);
  const committed = require("../app-context/dist/app-context.json");
  assert.deepEqual(derived, committed);
});

test("derive(src) carries expected _meta shape", () => {
  const derived = deriveToObject(srcDir);
  assert.equal(derived._schema_version, 1);
  assert.equal(derived._meta.auto_generated, true);
  assert.equal(typeof derived._meta.do_not_edit, "string");
});
