import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { EditorShell } from "../../src/app/EditorShell";
import { isWysiwygEnabled } from "../../src/lib/editorFlags";

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
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
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

test("Sidebar WYSIWYG toggle: off→on persists to localStorage and re-renders", async () => {
  cleanup();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();

  render(
    <Theme>
      <EditorShell
        octokit={fakeGh(FILE)}
        activePath={CONTENT_SAFE}
      />
    </Theme>
  );

  // Wait for sidebar to be present (needs entries to load — but fakeGh is instant)
  // The toggle is rendered regardless of entries load state (it's in the footer).
  const toggle = await waitFor(
    () => screen.getByRole("switch", { name: /wysiwyg editor/i }),
    { timeout: 5000 }
  );

  // Flag is OFF initially
  assert.equal(isWysiwygEnabled(), false, "flag should be off initially");
  assert.equal(toggle.getAttribute("aria-checked"), "false", "switch should be unchecked");

  // Flip it ON
  fireEvent.click(toggle);

  // localStorage should now have the key
  assert.equal(globalThis.localStorage.getItem("editor.wysiwyg"), "1", "localStorage key should be set after toggle on");
  assert.equal(isWysiwygEnabled(), true, "isWysiwygEnabled() should return true");

  // The switch should be checked
  await waitFor(
    () => assert.equal(screen.getByRole("switch", { name: /wysiwyg editor/i }).getAttribute("aria-checked"), "true"),
    { timeout: 2000 }
  );

  // Flip it back OFF
  fireEvent.click(screen.getByRole("switch", { name: /wysiwyg editor/i }));
  assert.equal(isWysiwygEnabled(), false, "isWysiwygEnabled() should return false after toggle off");
  assert.equal(globalThis.localStorage.getItem("editor.wysiwyg"), null, "localStorage key should be removed");

  cleanup();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
});

test("Sidebar WYSIWYG toggle: toggling on with SAFE content file causes body-editor to appear", async () => {
  cleanup();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();

  render(
    <Theme>
      <EditorShell
        octokit={fakeGh(FILE)}
        activePath={CONTENT_SAFE}
      />
    </Theme>
  );

  const toggle = await waitFor(
    () => screen.getByRole("switch", { name: /wysiwyg editor/i }),
    { timeout: 5000 }
  );

  // Flag off -> no WYSIWYG body editor role
  await waitFor(() => assert.ok(screen.getByText(CONTENT_SAFE)), { timeout: 5000 });
  assert.equal(screen.queryByRole("textbox", { name: /body editor/i }), null, "WYSIWYG should be off initially");

  // Flip ON
  fireEvent.click(toggle);

  // WYSIWYG body editor should now appear (no reload)
  await waitFor(
    () => assert.ok(screen.getByRole("textbox", { name: /body editor/i })),
    { timeout: 5000 }
  );

  cleanup();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
});
