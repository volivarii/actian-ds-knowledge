"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.resolve(__dirname, "..", "content", "src");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
  });
}

test("no Kramdown {: ...} IALs remain in content/src", () => {
  const offenders = walk(SRC).filter((p) =>
    /^\s*\{:\s*[^}]+\}\s*$/m.test(fs.readFileSync(p, "utf8")),
  );
  assert.deepEqual(offenders, [], "remove leftover {: .do-dont-table} IALs");
});
