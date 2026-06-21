"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pure = require("../scripts/app-context/lib-pure");
const lib = require("../scripts/app-context/lib");

test("lib-pure exports the 7 pure transforms", () => {
  for (const fn of ["recordToMarkdown", "markdownToRecord", "splitFrontmatter", "parseBodySections", "sectionProse", "sectionBullets", "stableStringify"]) {
    assert.equal(typeof pure[fn], "function", `${fn} missing`);
  }
});

test("lib-pure source imports no node: builtins", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "app-context", "lib-pure.js"), "utf8");
  assert.ok(!/require\(["']node:/.test(src), "lib-pure must not require node: builtins");
});

test("lib re-exports lib-pure fns identically + keeps writeAtomic", () => {
  assert.equal(lib.splitFrontmatter, pure.splitFrontmatter);
  assert.equal(lib.parseBodySections, pure.parseBodySections);
  assert.equal(typeof lib.writeAtomic, "function");
});

test("parseBodySections output is unchanged after the split", () => {
  const body = "\n## Purpose\n\nGov and catalog\n\n## Users\n\n- Steward\n";
  assert.deepEqual(pure.parseBodySections(body), lib.parseBodySections(body));
});
