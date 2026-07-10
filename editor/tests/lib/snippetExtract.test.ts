import { test } from "node:test";
import assert from "node:assert/strict";
import { snippetsForSlug } from "../../src/lib/snippetExtract";

const DOC = [
  "# Title",
  "",
  "Intro paragraph with no refs.",
  "",
  "Use a [dropdown select](dropdown-select) when options exceed six.",
  "It stays on one paragraph.",
  "",
  "```",
  "[fake](dropdown-select) inside code",
  "```",
  "",
  "Anchored: see [contrast rules](../accessibility/color-contrast#contrast-minimums).",
  "",
  "yaml-ish: { ref: contrast-minimums }",
].join("\n");

test("finds the enclosing paragraph for a bare-slug link", () => {
  const s = snippetsForSlug(DOC, "dropdown-select");
  assert.equal(s.length, 1);
  assert.ok(s[0]!.includes("when options exceed six. It stays on one paragraph."));
});

test("finds anchor-link and yaml-ref occurrences as separate snippets", () => {
  const s = snippetsForSlug(DOC, "contrast-minimums");
  assert.equal(s.length, 2);
});

test("fenced code is stripped, no snippet from code blocks", () => {
  const onlyCode = "```\n[x](target-slug)\n```\n";
  assert.deepEqual(snippetsForSlug(onlyCode, "target-slug"), []);
});

test("long paragraphs truncate to 240 chars with ellipsis", () => {
  const long = "See [x](#deep-anchor) " + "word ".repeat(100);
  const s = snippetsForSlug(long, "deep-anchor");
  assert.equal(s.length, 1);
  assert.ok(s[0]!.length <= 241);
  assert.ok(s[0]!.endsWith("…"));
});

test("unknown slug returns empty array", () => {
  assert.deepEqual(snippetsForSlug(DOC, "nope"), []);
});
