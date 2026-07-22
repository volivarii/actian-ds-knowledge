import { test } from "node:test";
import assert from "node:assert/strict";
import { renameAnchorInText } from "../../src/markdown-engine/anchorRename";

test("renames the heading marker", () => {
  assert.equal(
    renameAnchorInText("## Overview {#overview}\n", "overview", "intro"),
    "## Overview {#intro}\n",
  );
});

test("rewrites same-file links but not cross-file links", () => {
  const input = "## A {#a}\n\nsee [x](#a) and [y](modal#a) and [z](../f.md#a)\n";
  const out = renameAnchorInText(input, "a", "b");
  assert.match(out, /## A \{#b\}/);
  assert.match(out, /\[x\]\(#b\)/); // same-file rewritten
  assert.match(out, /\[y\]\(modal#a\)/); // cross-file untouched
  assert.match(out, /\[z\]\(\.\.\/f\.md#a\)/); // cross-file untouched
});

test("leaves markers and links inside fenced code untouched", () => {
  const input = "## A {#a}\n\n```\n## Example {#a}\nsee [x](#a)\n```\n[real](#a)\n";
  const out = renameAnchorInText(input, "a", "b");
  assert.match(out, /## A \{#b\}/); // real heading renamed
  assert.match(out, /```\n## Example \{#a\}\nsee \[x\]\(#a\)\n```/); // fence untouched
  assert.match(out, /\[real\]\(#b\)/); // real link renamed
});

test("byte-stable when nothing matches", () => {
  const input = "## Other {#other}\n\nprose\n";
  assert.equal(renameAnchorInText(input, "a", "b"), input);
});
