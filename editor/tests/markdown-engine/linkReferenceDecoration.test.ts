// The Milkdown rich-mode counterpart of the preview's typed links: a view-only
// ProseMirror decoration that dots + tags any link whose href resolves to a
// substrate component. The scan is a pure function over the doc, so it is
// tested directly against a doc built from the shared preset (same schema the
// live editor uses).
import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
} from "@milkdown/core";
import type { Node as PMNode } from "@milkdown/prose/model";
import { useMilkdownPresets } from "../../src/markdown-engine/milkdownPreset";
import {
  collectLinkReferences,
  linkReferenceDecorations,
  linkReferenceInlineAttrs,
} from "../../src/markdown-engine/linkReferenceDecoration";

/** Build a doc from markdown using the SHARED preset (same schema as the live
 *  rich editor), so link marks + hrefs match production exactly. */
async function docFrom(markdown: string): Promise<PMNode> {
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
  if (!doc) throw new Error("failed to build doc");
  return doc;
}

test("collectLinkReferences returns only links whose href resolves to a component", async () => {
  const doc = await docFrom(
    "See [table](table), an [ext](https://example.com) site, and [dropdown](dropdown-select).",
  );
  const refs = collectLinkReferences(doc);
  assert.equal(refs.length, 1, "only the real component link resolves");
  assert.equal(refs[0]!.slug, "table");
  assert.equal(refs[0]!.type, "component");
  assert.ok(refs[0]!.to > refs[0]!.from, "span covers the link text");
});

test("linkReferenceDecorations decorates a resolving link and leaves others alone", async () => {
  const withRef = await docFrom(
    "[table](table) and [ext](https://example.com)",
  );
  assert.ok(
    linkReferenceDecorations(withRef).find().length >= 1,
    "at least one decoration for the resolving link",
  );

  const noRef = await docFrom("just [ext](https://example.com) here");
  assert.equal(
    linkReferenceDecorations(noRef).find().length,
    0,
    "no decorations when no link resolves",
  );
});

test("a link with internal formatting coalesces to a single reference (one dot, not one per text node)", async () => {
  const doc = await docFrom("[**bold** table](table) end");
  const refs = collectLinkReferences(doc);
  assert.equal(refs.length, 1, "the whole link is one reference span");
  assert.equal(refs[0]!.slug, "table");
});

test("the inline decoration attrs carry the human type label (a11y: type not conveyed by color alone) plus the highlight hooks", () => {
  const attrs = linkReferenceInlineAttrs({
    from: 1,
    to: 6,
    slug: "table",
    type: "component",
  });
  assert.equal(attrs.title, "Component", "type named in words, not color-only");
  assert.equal(attrs["data-ref"], "table");
  assert.equal(attrs["data-node-type"], "component");
  assert.equal(attrs.class, "md-ref");
});
