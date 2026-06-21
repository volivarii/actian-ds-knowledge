"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pure = require("../scripts/app-context/lib-pure");
const lib = require("../scripts/app-context/lib");

test("lib-pure exports the 8 pure transforms", () => {
  for (const fn of [
    "recordToMarkdown",
    "markdownToRecord",
    "splitFrontmatter",
    "parseBodySections",
    "sectionProse",
    "sectionBullets",
    "stableStringify",
    "unescapeMarkdownText",
  ]) {
    assert.equal(typeof pure[fn], "function", `${fn} missing`);
  }
});

test("lib-pure source imports no node: builtins", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "app-context", "lib-pure.js"),
    "utf8",
  );
  assert.ok(
    !/require\(["']node:/.test(src),
    "lib-pure must not require node: builtins",
  );
});

test("lib re-exports lib-pure fns identically + keeps writeAtomic", () => {
  assert.equal(lib.splitFrontmatter, pure.splitFrontmatter);
  assert.equal(lib.parseBodySections, pure.parseBodySections);
  // derive-app-context imports unescapeMarkdownText from ./lib, so the re-export
  // is a production path — assert identity so a broken re-export is caught.
  assert.equal(lib.unescapeMarkdownText, pure.unescapeMarkdownText);
  assert.equal(typeof lib.writeAtomic, "function");
});

test("parseBodySections output is unchanged after the split", () => {
  const body = "\n## Purpose\n\nGov and catalog\n\n## Users\n\n- Steward\n";
  assert.deepEqual(pure.parseBodySections(body), lib.parseBodySections(body));
});

test("unescapeMarkdownText reverses serializer punctuation escapes", () => {
  const u = pure.unescapeMarkdownText;
  // The escapes a CommonMark serializer introduces in text.
  assert.equal(u("data\\_product"), "data_product");
  assert.equal(u("2\\*3"), "2*3");
  assert.equal(u("a\\_b\\_c and cost\\*spike"), "a_b_c and cost*spike");
  // Escaped backslash collapses back to one backslash.
  assert.equal(u("C:\\\\path"), "C:\\path");
  // Leaves already-bare text and non-escape sequences (e.g. `\n`) untouched.
  assert.equal(u("data_product"), "data_product");
  assert.equal(u("line\\nbreak"), "line\\nbreak"); // \n here is literal backslash-n, not an escape
});

test("unescapeMarkdownText: documented limitation — author-intended `\\`-before-punct is dropped", () => {
  const u = pure.unescapeMarkdownText;
  // A markdown round-trip can't distinguish a defensive escape from an
  // author-intended literal backslash, so this drops it. Accepted: this
  // substrate's prose has no such content (verified: zero backslashes in src).
  assert.equal(u("path C:\\_temp here"), "path C:_temp here");
});
