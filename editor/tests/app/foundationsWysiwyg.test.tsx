import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { MarkdownEditScreen } from "../../src/app/MarkdownEditScreen";

// happy-dom lacks sessionStorage/localStorage -- minimal in-memory stubs.
for (const key of ["sessionStorage", "localStorage"] as const) {
  if (!(globalThis as any)[key]) {
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, key, {
      configurable: true, writable: true,
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      },
    });
  }
}
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const fakeGh = (text: string) => ({
  repos: { getContent: async () => ({ data: { content: b64(text), encoding: "base64", sha: "F1" } }) },
  git: {}, pulls: {},
}) as any;

const SAFE = "foundations/src/design-guidelines.md";
const UNSAFE = "foundations/src/color-primitives.md";
const FILE = "## 3. Guidelines {#g}\n\nProse.\n";

test("SAFE foundations file renders RichBodyEditor when the wysiwyg flag is on", async () => {
  cleanup(); globalThis.localStorage.clear();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  render(<Theme><MarkdownEditScreen path={SAFE} octokit={fakeGh(FILE)} /></Theme>);
  await waitFor(() => assert.ok(screen.getByRole("textbox", { name: /body editor/i })), { timeout: 5000 });
  globalThis.sessionStorage.clear(); cleanup();
});

test("UNSAFE foundations file (color-primitives) stays CodeMirror even with the flag on", async () => {
  cleanup(); globalThis.localStorage.clear();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  render(<Theme><MarkdownEditScreen path={UNSAFE} octokit={fakeGh(FILE)} /></Theme>);
  await waitFor(() => assert.ok(screen.getByText(UNSAFE)), { timeout: 5000 });
  assert.equal(screen.queryByRole("textbox", { name: /body editor/i }), null, "unsafe file must not use RichBodyEditor");
  globalThis.sessionStorage.clear(); cleanup();
});

test("flag OFF -> CodeMirror (no body-editor role)", async () => {
  cleanup(); globalThis.localStorage.clear(); globalThis.sessionStorage.clear();
  render(<Theme><MarkdownEditScreen path={SAFE} octokit={fakeGh(FILE)} /></Theme>);
  await waitFor(() => assert.ok(screen.getByText(SAFE)), { timeout: 5000 });
  assert.equal(screen.queryByRole("textbox", { name: /body editor/i }), null, "flag-off must use CodeMirror");
  cleanup();
});
