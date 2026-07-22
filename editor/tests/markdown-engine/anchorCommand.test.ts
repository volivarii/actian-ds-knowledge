import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
} from "@milkdown/core";
import { callCommand, getMarkdown } from "@milkdown/utils";
import { TextSelection } from "@milkdown/prose/state";
import { useMilkdownPresets } from "../../src/markdown-engine/milkdownPreset";
import { addAnchorCommand } from "../../src/markdown-engine/anchorCommand";

/** Build an editor, put the cursor at the end of the FIRST heading, run the
 *  add-anchor command, and return the serialized markdown. */
async function runAtFirstHeadingEnd(markdown: string): Promise<string> {
  const root = globalThis.document.createElement("div");
  const editor = await useMilkdownPresets(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    }),
  ).create();
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    let hEnd = -1;
    view.state.doc.descendants((node, pos) => {
      if (hEnd === -1 && node.type.name === "heading") {
        hEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });
    if (hEnd !== -1) {
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.near(view.state.doc.resolve(hEnd), -1),
        ),
      );
    }
  });
  editor.action(callCommand(addAnchorCommand.key));
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

test("addAnchorCommand: inert on an already-anchored heading", async () => {
  const md = await runAtFirstHeadingEnd("## Overview {#overview}\n");
  assert.match(md, /\{#overview\}/);
  // No SECOND anchor added: exactly one {# marker in the doc.
  assert.equal((md.match(/\{#/g) ?? []).length, 1);
});

test("addAnchorCommand: adds a unique slug when the heading has none", async () => {
  // First heading is UNANCHORED; an existing {#overview} lives on another heading.
  // The command targets the first heading and must disambiguate to overview-2.
  const md = await runAtFirstHeadingEnd(
    "## Overview\n\n## Other {#overview}\n",
  );
  assert.match(md, /## Overview \{#overview-2\}/); // single space, unique
});

test("addAnchorCommand: places the marker AFTER a trailing inline mark, not inside it", async () => {
  // A heading ending in emphasis must not swallow the marker into the markup.
  const md = await runAtFirstHeadingEnd("## Draft *notes*\n");
  assert.match(md, /## Draft \*notes\* \{#draft-notes\}/);
  assert.doesNotMatch(md, /\{#[a-z0-9-]+\}\*/); // never `{#...}*`
});
