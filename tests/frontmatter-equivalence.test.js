// TEMPORARY: deleted in Task 5 once the old parser is gone. Proves the
// yaml-lib adapter parses every REAL source file identically to the old
// parser, after sources are re-quoted to strict YAML.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const OLD = require("../scripts/categories/categories-parser");
const NEW = require("../scripts/lib/frontmatter");
const ROOT = path.resolve(__dirname, "..");

function walk(dir, pred, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, out);
    else if (pred(p, e.name)) out.push(p);
  }
  return out;
}

// 1. categories + graph + foundations: fenced (or optionally-fenced) .md via parse
const fencedMd = [
  ...walk(
    path.join(ROOT, "components/src/categories"),
    (_p, n) => n.endsWith(".md") && n !== "AUTHORING.md",
  ),
  ...walk(
    path.join(ROOT, "content/src"),
    (_p, n) => n.endsWith(".md") && n !== "AUTHORING.md",
  ),
  ...walk(
    path.join(ROOT, "foundations/src"),
    (_p, n) => n.endsWith(".md") && n !== "AUTHORING.md",
  ),
].filter((p) => fs.readFileSync(p, "utf8").startsWith("---"));

for (const p of fencedMd) {
  test(`equivalence (fenced): ${path.relative(ROOT, p)}`, () => {
    const src = fs.readFileSync(p, "utf8");
    assert.deepEqual(NEW.parse(src).data, OLD.parse(src).data);
  });
}

// 2. guidelines: fence-less .yml via parseFrontmatter(text, 0)
const ymls = walk(
  path.join(ROOT, "components/src"),
  (_p, n) => n === "_meta.yml" || n === "tokens.yml",
);
for (const p of ymls) {
  test(`equivalence (yml): ${path.relative(ROOT, p)}`, () => {
    const src = fs.readFileSync(p, "utf8");
    assert.deepEqual(NEW.parseFrontmatter(src, 0), OLD.parseFrontmatter(src, 0));
  });
}
