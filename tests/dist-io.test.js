"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { stableStringify, writeAtomic } = require("../scripts/lib/dist-io");

test("stableStringify: 2-space indent + trailing newline", () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), '{\n  "b": 1,\n  "a": 2\n}\n');
});

test("stableStringify: matches the legacy inline impl exactly", () => {
  const obj = { x: [1, { y: "z" }], n: null };
  assert.equal(stableStringify(obj), JSON.stringify(obj, null, 2) + "\n");
});

test("writeAtomic: creates missing parent dirs and writes contents", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "dist-io-"));
  const dest = path.join(base, "nested", "deep", "out.json");
  writeAtomic(dest, stableStringify({ ok: true }));
  assert.equal(fs.readFileSync(dest, "utf8"), '{\n  "ok": true\n}\n');
  fs.rmSync(base, { recursive: true, force: true });
});

test("writeAtomic: overwrites an existing file (re-derive case)", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "dist-io-"));
  const dest = path.join(base, "out.json");
  writeAtomic(dest, stableStringify({ v: 1 }));
  writeAtomic(dest, stableStringify({ v: 2 }));
  assert.equal(fs.readFileSync(dest, "utf8"), '{\n  "v": 2\n}\n');
  fs.rmSync(base, { recursive: true, force: true });
});
