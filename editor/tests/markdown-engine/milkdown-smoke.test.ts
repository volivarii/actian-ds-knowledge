import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { getMarkdown, replaceAll } from "@milkdown/utils";

test("headless Milkdown round-trips a markdown body", async () => {
  const root = globalThis.document.createElement("div");
  const editor = await Editor.make()
    .config((ctx) => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, "## Purpose\n\nHello\n"); })
    .use(commonmark)
    .create();
  const out = editor.action(getMarkdown());
  assert.match(out, /## Purpose/);
  assert.match(out, /Hello/);
  editor.action(replaceAll("## Users\n\n- A\n"));
  assert.match(editor.action(getMarkdown()), /## Users/);
  await editor.destroy();
});
