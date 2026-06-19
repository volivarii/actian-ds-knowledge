"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { deriveToObject } = require("../scripts/app-context/derive-app-context");

const ROOT = path.resolve(__dirname, "..");
const golden = require("../app-context/dist/app-context.golden.json");

test("derive(src) reproduces the golden collections (lossless round-trip)", () => {
  const dist = deriveToObject(path.join(ROOT, "app-context", "src"));
  for (const kind of ["apps", "entities", "terminology", "patterns"]) {
    assert.deepEqual(dist[kind], golden[kind], `${kind} must match golden`);
  }
  assert.equal(dist._schema_version, 1);
  assert.equal(dist._meta.auto_generated, true);
});
