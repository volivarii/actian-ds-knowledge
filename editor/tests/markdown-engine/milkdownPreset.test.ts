import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { roundTripMarkdown } from "../../src/markdown-engine/milkdownPreset";

test("roundTripMarkdown keeps a GFM table as a table (not escaped text)", async () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |\n";
  const out = await roundTripMarkdown(table);
  // gfm parses it as a real table → delimiter row with dashes survives,
  // cells preserved. (commonmark-only would not produce a table node.)
  assert.match(out, /\| *A *\| *B *\|/, "header row preserved");
  assert.match(out, /\| *-+ *\| *-+ *\|/, "delimiter row preserved");
  assert.match(out, /\| *1 *\| *2 *\|/, "body row preserved");
  // idempotent: a second pass is a fixed point.
  assert.equal(await roundTripMarkdown(out), out, "idempotent");
});

test("a heading with {#anchor} adjacent to a table is NOT escaped under gfm", async () => {
  const doc =
    "## 6. Title {#anchor}\n\ntext\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n";
  const out = await roundTripMarkdown(doc);
  assert.doesNotMatch(
    out,
    /\\#/,
    "heading hashes must not be backslash-escaped",
  );
  assert.match(out, /\{#anchor\}/, "{#anchor} preserved");
});

test("GFM constructs preserve their content across the round-trip", async () => {
  const cases: Array<[string, string, RegExp]> = [
    ["strikethrough", "~~gone~~ stays\n", /~~gone~~/],
    [
      "task list",
      "- [ ] todo item\n- [x] done item\n",
      /\[[ x]\]\s+todo item/i,
    ],
    [
      "autolink",
      "See <https://example.com> for more.\n",
      /https:\/\/example\.com/,
    ],
  ];
  for (const [label, input, re] of cases) {
    const out = await roundTripMarkdown(input);
    assert.match(out, re, `${label} content preserved`);
    assert.equal(await roundTripMarkdown(out), out, `${label} idempotent`);
  }
});
