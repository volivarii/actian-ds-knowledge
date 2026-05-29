"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const astWalk = require("../scripts/lib/section-dist/ast-walk.js");

const H1_STREAM = [
  "# Alpha {#alpha}", "", "intro alpha", "",
  "## Alpha One {#alpha-one}", "", "body a1", "",
  "# Beta {#beta}", "", "intro beta", "",
  "## Beta One {#beta-one}", "", "body b1", "",
].join("\n") + "\n";

test("sectionLevel:1 emits H1 headings as top-level sections (virtual root)", () => {
  const tree = astWalk.buildSectionTree(astWalk.parseMarkdown(H1_STREAM), { sectionLevel: 1 });
  assert.deepEqual(tree.map((n) => n.slug), ["alpha", "beta"]);
  const alpha = tree[0];
  assert.equal((alpha.children || []).length, 1);
  assert.equal(alpha.children[0].slug, "alpha-one");
});

test("default (sectionLevel:2) treats H1 as root and H2s as top-level sections", () => {
  const H2_STREAM = [
    "# Doc Root {#root}", "",
    "## Section A {#sec-a}", "", "a", "",
    "## Section B {#sec-b}", "", "b", "",
  ].join("\n") + "\n";
  const tree = astWalk.buildSectionTree(astWalk.parseMarkdown(H2_STREAM), {});
  assert.deepEqual(tree.map((n) => n.slug), ["sec-a", "sec-b"]);
});
