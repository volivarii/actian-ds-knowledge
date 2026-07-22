import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
} from "@milkdown/core";
import { getMarkdown } from "@milkdown/utils";
import type { Node as PMNode } from "@milkdown/prose/model";
import { useMilkdownPresets } from "../../src/markdown-engine/milkdownPreset";
import {
  collectHeadingAnchors,
  headingAnchorDecorations,
} from "../../src/markdown-engine/headingAnchorDecoration";

/** Build a doc from markdown using the SHARED preset (same schema as the live
 *  rich editor). Returns the doc and its round-tripped markdown. */
async function build(markdown: string): Promise<{ doc: PMNode; md: string }> {
  const root = globalThis.document.createElement("div");
  const editor = await useMilkdownPresets(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    }),
  ).create();
  let doc: PMNode | null = null;
  editor.action((ctx) => {
    doc = ctx.get(editorViewCtx).state.doc;
  });
  const md = editor.action(getMarkdown());
  await editor.destroy();
  if (!doc) throw new Error("failed to build doc");
  return { doc, md };
}

test("collectHeadingAnchors finds a heading's trailing {#slug} span", async () => {
  const { doc } = await build("## Overview {#overview}\n\nprose\n");
  const spans = collectHeadingAnchors(doc);
  assert.equal(spans.length, 1);
  assert.equal(spans[0]!.slug, "overview");
  assert.ok(spans[0]!.to > spans[0]!.from, "span covers the raw marker");
});

test("collectHeadingAnchors ignores headings without an anchor and prose", async () => {
  const { doc } = await build("## Plain heading\n\nprose text here\n");
  assert.equal(collectHeadingAnchors(doc).length, 0);
});

test("headingAnchorDecorations produces a widget + inline deco per anchor", async () => {
  const { doc } = await build("# Title {#title}\n");
  assert.ok(headingAnchorDecorations(doc).find().length >= 2);
});

test("the decoration is view-only: markdown is byte-identical", async () => {
  const input = "## Overview {#overview}\n\nprose\n";
  const { md } = await build(input);
  // Decorations never touch the doc; the serialized output must round-trip.
  assert.equal(md.trim(), input.trim());
});
