"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const astWalk = require("../scripts/lib/section-dist/ast-walk.js");

test("slug derivation prefers an explicit {#anchor} over slugified text", () => {
  const md = "## Colour & Contrast {#color-contrast}\n\nbody\n";
  const tokens = astWalk.parseMarkdown(md);
  const tree = astWalk.buildSectionTree(tokens, {});
  // the H2 node's slug must be the anchor, NOT slugify("Colour & Contrast")
  assert.equal(tree[0].slug, "color-contrast");
});
test("slug derivation falls back to slugified text when no anchor", () => {
  const md = "## Focus & Keyboard\n\nbody\n";
  const tree = astWalk.buildSectionTree(astWalk.parseMarkdown(md), {});
  assert.equal(tree[0].slug, "focus-keyboard");
});
