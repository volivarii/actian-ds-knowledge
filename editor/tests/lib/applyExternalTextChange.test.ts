import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { applyExternalTextChange } from "../../src/lib/applyExternalTextChange";

test("applyExternalTextChange dispatches a full replacement through a live view and skips the fallback", () => {
  const view = new EditorView({
    state: EditorState.create({ doc: "old text" }),
  });
  let fallbackCalls = 0;
  applyExternalTextChange(view, "new text", () => {
    fallbackCalls++;
  });
  assert.equal(view.state.doc.toString(), "new text");
  assert.equal(fallbackCalls, 0);
});

test("applyExternalTextChange calls the fallback when no view is live (rich mode)", () => {
  let fallbackArg: string | null = null;
  let fallbackCalls = 0;
  applyExternalTextChange(null, "new text", (next) => {
    fallbackCalls++;
    fallbackArg = next;
  });
  assert.equal(fallbackCalls, 1);
  assert.equal(fallbackArg, "new text");
});
