import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { getMarkdown } from "@milkdown/utils";
import { roundTripMarkdown } from "../../src/markdown-engine/milkdownPreset";

// commonmark-ONLY round-trip = the A/B baseline. roundTripMarkdown adds gfm; a
// test of gfm behavior is only non-vacuous if it asserts a difference gfm
// produces that commonmark alone cannot. This mirrors roundTripMarkdown minus
// the gfm preset — if gfm were removed from the shared module, roundTripMarkdown
// would collapse onto this baseline and every assertion below would fail.
async function commonmarkOnly(body: string): Promise<string> {
  const root = globalThis.document.createElement("div");
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, body);
    })
    .use(commonmark)
    .create();
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

test("gfm parses a table as a real node — commonmark leaves it literal (discriminating)", async () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |\n";
  const gfmOut = await roundTripMarkdown(table);
  const cmOut = await commonmarkOnly(table);
  // Anti-vacuity anchor: if gfm were removed, gfmOut would equal cmOut.
  assert.notEqual(
    gfmOut,
    cmOut,
    "gfm must transform the table; commonmark-only cannot",
  );
  // commonmark keeps the raw `---` delimiter (it never built a table node);
  // gfm re-serializes through a real table node, normalizing the delimiter.
  assert.match(
    cmOut,
    /\| --- \| --- \|/,
    "commonmark leaves the raw delimiter (A/B is real)",
  );
  assert.doesNotMatch(
    gfmOut,
    /---/,
    "gfm normalizes the raw `---` delimiter away",
  );
  // content preserved + idempotent under gfm.
  assert.match(gfmOut, /\| *A *\| *B *\|/, "header preserved");
  assert.match(gfmOut, /\| *1 *\| *2 *\|/, "body cells preserved");
  assert.equal(await roundTripMarkdown(gfmOut), gfmOut, "idempotent");
});

test("gfm constructs are NOT degraded to escaped literal text (discriminating)", async () => {
  // strikethrough: commonmark has no `~~` → escapes it to `\~~`; gfm keeps the mark.
  const strikeIn = "~~gone~~ stays\n";
  const strike = await roundTripMarkdown(strikeIn);
  assert.match(
    await commonmarkOnly(strikeIn),
    /\\~/,
    "commonmark-only escapes ~~ (A/B is real)",
  );
  assert.doesNotMatch(
    strike,
    /\\~/,
    "gfm must NOT backslash-escape strikethrough",
  );
  assert.match(strike, /~~gone~~/, "strikethrough content preserved");

  // task list: commonmark escapes the `[ ]` checkbox to `\[ ]`; gfm keeps a task item.
  const taskIn = "- [ ] todo item\n- [x] done item\n";
  const task = await roundTripMarkdown(taskIn);
  assert.match(
    await commonmarkOnly(taskIn),
    /\\\[/,
    "commonmark-only escapes the checkbox (A/B is real)",
  );
  assert.doesNotMatch(
    task,
    /\\\[/,
    "gfm must NOT backslash-escape the task checkbox",
  );
  assert.match(task, /\[[ xX]\]\s+todo item/, "task content preserved");

  // idempotent under gfm.
  assert.equal(
    await roundTripMarkdown(strike),
    strike,
    "strikethrough idempotent",
  );
  assert.equal(await roundTripMarkdown(task), task, "task list idempotent");
});

test("gfm keeps a table-heavy heading + {#anchor} intact (vs commonmark) — discriminating", async () => {
  // A table-heavy section with a Kramdown {#anchor} heading. commonmark cannot
  // parse the pipe table → leaves the rows literal, so its output diverges from
  // gfm, which parses + normalizes the (deliberately ragged) table and keeps the
  // leading `## ... {#anchor}` heading intact and unescaped. Inline fixture, NOT a
  // live content file — so WYSIWYG baseline normalization can't invalidate it
  // (this previously read accessibility/src/aria-labels.md, which is now gated).
  const body = [
    "## 6. ARIA & Labels {#aria-labels}",
    "",
    "Designers annotate specs. Engineering implements.",
    "",
    "| Attribute | When to use |",
    "|---|------------------------------|",
    "| aria-label | Element has no visible text (icon buttons) |",
    "| aria-labelledby | A visible element labels this one |",
    "",
  ].join("\n");
  const gfmOut = await roundTripMarkdown(body);
  const cmOut = await commonmarkOnly(body);
  assert.notEqual(
    gfmOut,
    cmOut,
    "gfm parses the tables; commonmark cannot → outputs differ",
  );
  assert.match(
    gfmOut,
    /## 6\. ARIA & Labels/,
    "leading heading text intact under gfm",
  );
  assert.match(gfmOut, /\{#aria-labels\}/, "{#anchor} preserved under gfm");
  assert.doesNotMatch(gfmOut, /\\#/, "no backslash-escaped hashes under gfm");
});
