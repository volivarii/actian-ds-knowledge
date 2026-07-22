import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import type { EditorView } from "@codemirror/view";
import { CodeMirrorEditor } from "../../src/markdown-engine/CodeMirrorEditor";

afterEach(() => {
  cleanup();
});

// Guards the stale-view invariant: the parent caches the view via onReady and
// dispatches into it (applyExternalTextChange, onRestore). If unmount left the
// cached view pointing at a destroyed instance, a later dispatch would silently
// drop the change. onReady(null) on unmount is what keeps that from happening.
test("CodeMirrorEditor: onReady fires with the view on mount and null on unmount", () => {
  const calls: (EditorView | null)[] = [];
  const { unmount } = render(
    <CodeMirrorEditor
      initialText="# hi"
      onChange={() => {}}
      onReady={(v) => calls.push(v)}
    />,
  );
  assert.equal(calls.length, 1, "onReady fired once on mount");
  assert.ok(calls[0], "mount passed a live view");

  unmount();
  assert.equal(calls.length, 2, "onReady fired again on unmount");
  assert.equal(calls[1], null, "unmount passed null (no stale view)");
});
