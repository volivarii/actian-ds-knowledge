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
import { TextSelection } from "@milkdown/prose/state";
import { useMilkdownPresets } from "../../src/markdown-engine/milkdownPreset";
import { insertReferenceLink } from "../../src/markdown-engine/referenceAutocomplete";

// CONTROLLER FINDING (reviewed High, empirically reproduced): insertReferenceLink
// leaves the caret at the link's right edge with storedMarks === null. The
// commonmark link mark is inclusive by default, so ProseMirror falls back to
// computing marks from the surrounding document (resolve(pos).marks()) for the
// NEXT typed character, and that computation absorbs the still-open link mark:
// typing "x" right after a freshly inserted "[Button](button)" produces
// "[Buttonx](button)" instead of "[Button](button)x". This test drives a REAL
// editor built from the shared preset (same as rich-toolbar-commands.test.ts)
// through insertReferenceLink and then simulates the next keystroke the same
// way ProseMirror resolves it when no explicit stored marks are set: via
// `tr.insertText(text, pos)` with an explicit position, which uses
// `state.storedMarks` when present and otherwise falls back to marks resolved
// at that position (see prosemirror-state Transaction.insertText).

/** Build a real editor with the SHARED preset (identical to the live editor),
 *  seed it, run insertReferenceLink against a fake trigger range, then
 *  simulate the very next keystroke landing at the resulting caret. Returns
 *  the serialized markdown after both steps. */
async function insertLinkThenType(): Promise<string> {
  const root = globalThis.document.createElement("div");
  const editor = await useMilkdownPresets(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, "before \n");
    }),
  ).create();

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    // Paragraph text is "before" (the trailing space/newline is not enough to
    // survive commonmark parsing as a hard break). Positions 1-7 are the text
    // "before"; treat the last two characters ("re", positions 5-7) as a
    // stand-in for a real "[[query" trigger range: insertReferenceLink only
    // cares about the range bounds, not what currently occupies them.
    const range = { from: 5, to: 7 };
    // Real trigger detection (matchTrigger) only ever fires with the caret
    // sitting exactly at range.to (the match is anchored at the selection),
    // so put the caret there before calling insertReferenceLink: that is
    // what makes the post-replaceWith selection land at the link's right
    // edge instead of wherever the doc's default cursor happened to be.
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, range.to),
      ),
    );
    insertReferenceLink(view, range, {
      label: "Button",
      kind: "component",
      href: "button",
      detail: "button",
    });

    // Simulate the next keystroke exactly as ProseMirror would resolve it:
    // an explicit-position insertText, which uses state.storedMarks when set
    // and otherwise falls back to marks resolved AT that position (the path
    // that, pre-fix, absorbs the still-open inclusive link mark).
    const caret = view.state.selection.from;
    view.dispatch(view.state.tr.insertText("x", caret));
  });

  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

test("typed character after an inserted reference link stays outside the link", async () => {
  const md = await insertLinkThenType();
  assert.match(
    md,
    /\[Button\]\(button\)x/,
    `expected the "x" typed right after the link to land OUTSIDE it, got: ${md}`,
  );
  assert.doesNotMatch(
    md,
    /\[Buttonx\]/,
    `the typed "x" was absorbed INTO the link label, got: ${md}`,
  );
});
