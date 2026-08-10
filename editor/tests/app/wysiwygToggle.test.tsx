import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { EditorShell } from "../../src/app/EditorShell";
import { isWysiwygEnabled } from "../../src/lib/editorFlags";
import { assertNoElement } from "../helpers/editorSurface";

// happy-dom lacks sessionStorage/localStorage -- minimal in-memory stubs.
// Reuse the same pattern as contentA11yWysiwyg.test.tsx.
for (const key of ["sessionStorage", "localStorage"] as const) {
  if (!(globalThis as any)[key]) {
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      },
    });
  }
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const CONTENT_SAFE = "content/src/global-guidelines.md";
const FILE = "## Heading {#h}\n\nProse.\n";

const fakeGh = (text: string) =>
  ({
    repos: {
      getContent: async () => ({
        data: { content: b64(text), encoding: "base64", sha: "F1" },
      }),
    },
    git: {},
    pulls: {},
  }) as any;

// The rich editor is the DEFAULT now, so this toggle is an opt-OUT and its
// first click turns the editor OFF. The opt-out has to be WRITTEN ("0"), not
// recorded by removing the key: an absent key is "never chose", which reads as
// on, so a removed key would silently undo the author's choice on reload.
test("Sidebar rich-text toggle: on→off persists the opt-out and re-renders", async () => {
  cleanup();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();

  render(
    <Theme>
      <EditorShell octokit={fakeGh(FILE)} activePath={CONTENT_SAFE} />
    </Theme>,
  );

  // Wait for sidebar to be present (needs entries to load — but fakeGh is instant)
  // The toggle is rendered regardless of entries load state (it's in the footer).
  const toggle = await waitFor(
    () => screen.getByRole("switch", { name: /rich text editor/i }),
    { timeout: 5000 },
  );

  // Nothing stored = the author has not chosen = ON.
  assert.equal(isWysiwygEnabled(), true, "flag should default to on");
  assert.equal(
    toggle.getAttribute("aria-checked"),
    "true",
    "switch should start checked",
  );

  // Flip it OFF
  fireEvent.click(toggle);

  assert.equal(
    globalThis.localStorage.getItem("editor.wysiwyg"),
    "0",
    "opting out must WRITE '0'; removing the key would read as 'never chose' (on)",
  );
  assert.equal(isWysiwygEnabled(), false, "isWysiwygEnabled() should be false");

  // The switch should be unchecked
  await waitFor(
    () =>
      assert.equal(
        screen
          .getByRole("switch", { name: /rich text editor/i })
          .getAttribute("aria-checked"),
        "false",
      ),
    { timeout: 2000 },
  );

  // Flip it back ON
  fireEvent.click(screen.getByRole("switch", { name: /rich text editor/i }));
  assert.equal(isWysiwygEnabled(), true, "toggling back on should re-enable");
  assert.equal(
    globalThis.localStorage.getItem("editor.wysiwyg"),
    "1",
    "opting back in should record '1'",
  );

  cleanup();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
});

// Same live-swap guarantee as before, read in the direction the toggle now runs:
// the surface has to change without a reload.
test("Sidebar rich-text toggle: toggling off with a SAFE content file swaps the body editor away", async () => {
  cleanup();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();

  render(
    <Theme>
      <EditorShell octokit={fakeGh(FILE)} activePath={CONTENT_SAFE} />
    </Theme>,
  );

  const toggle = await waitFor(
    () => screen.getByRole("switch", { name: /rich text editor/i }),
    { timeout: 5000 },
  );

  // Default on -> the rich body editor is present for a safe file.
  await waitFor(
    () => assert.ok(screen.getByRole("textbox", { name: /body editor/i })),
    { timeout: 5000 },
  );

  // Flip OFF
  fireEvent.click(toggle);

  // The rich body editor should disappear (no reload).
  await waitFor(
    () =>
      assertNoElement(
        screen.queryByRole("textbox", { name: /body editor/i }),
        "opting out should swap back to CodeMirror",
      ),
    { timeout: 5000 },
  );

  cleanup();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
});
