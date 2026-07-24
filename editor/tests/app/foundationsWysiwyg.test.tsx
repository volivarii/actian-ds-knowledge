import "../setup-happy-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { MarkdownEditScreen } from "../../src/app/MarkdownEditScreen";
import { draftStoreSingleton } from "../../src/drafts/store-instance";

// File-level, not inline per test: an inline cleanup() after the last
// assertion is skipped the moment that assertion throws, leaking a mounted
// component into the next test. afterEach runs regardless of the test's
// outcome, so a throw can no longer leak a mount.
afterEach(() => {
  cleanup();
});

// happy-dom lacks sessionStorage/localStorage -- minimal in-memory stubs.
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

const SAFE = "foundations/src/design-guidelines.md";
// AUTHORING.md is the only foundations/src file still outside the registry
// (round-trip is not idempotent — Milkdown injects loose-list blank lines + cell
// normalization, rt2 !== rt1). color-primitives + tokens were flipped in slice 5,
// so they're no longer valid "unsafe" fixtures.
const UNSAFE = "foundations/src/AUTHORING.md";
const FILE = "## 3. Guidelines {#g}\n\nProse.\n";

test("SAFE foundations file renders RichBodyEditor when the wysiwyg flag is on", async () => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  render(
    <Theme>
      <MarkdownEditScreen path={SAFE} octokit={fakeGh(FILE)} />
    </Theme>,
  );
  await waitFor(
    () => assert.ok(screen.getByRole("textbox", { name: /body editor/i })),
    { timeout: 5000 },
  );
  globalThis.sessionStorage.clear();
});

test("UNSAFE foundations file (AUTHORING) stays CodeMirror even with the flag on", async () => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  render(
    <Theme>
      <MarkdownEditScreen path={UNSAFE} octokit={fakeGh(FILE)} />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.getByText(UNSAFE)), { timeout: 5000 });
  assert.equal(
    screen.queryByRole("textbox", { name: /body editor/i }),
    null,
    "unsafe file must not use RichBodyEditor",
  );
  globalThis.sessionStorage.clear();
});

test("flag OFF -> CodeMirror (no body-editor role)", async () => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
  render(
    <Theme>
      <MarkdownEditScreen path={SAFE} octokit={fakeGh(FILE)} />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.getByText(SAFE)), { timeout: 5000 });
  assert.equal(
    screen.queryByRole("textbox", { name: /body editor/i }),
    null,
    "flag-off must use CodeMirror",
  );
});

// ─── Fix #2: WYSIWYG draft restore test ──────────────────────────────────────
//
// onRestore only applied the draft `if (draft && view)`, where `view` is the
// CodeMirror EditorView. In WYSIWYG mode the CodeMirror branch is not rendered
// so `view` is always null -- clicking Restore was a silent no-op. The fix
// generalises onRestore to always update `text` state from `draft.text` (and
// clear the draft), and bumps a key on RichBodyEditor to force it to re-seed.
test("WYSIWYG restore: clicking Restore applies draft body to RichBodyEditor", async () => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");

  const REMOTE_SHA = "F1";
  const REMOTE_TEXT = "## 3. Guidelines {#g}\n\nOriginal prose.\n";
  const DRAFT_BODY = "Draft prose that was restored.";
  const DRAFT_TEXT = `## 3. Guidelines {#g}\n\n${DRAFT_BODY}\n`;

  // Seed a draft whose basedOnSha matches the remote SHA so the screen
  // opens the restore prompt.
  draftStoreSingleton.save(SAFE, {
    text: DRAFT_TEXT,
    basedOnSha: REMOTE_SHA,
    ts: Date.now(),
  });

  render(
    <Theme>
      <MarkdownEditScreen path={SAFE} octokit={fakeGh(REMOTE_TEXT)} />
    </Theme>,
  );

  // The restore prompt dialog should appear ("Unsaved changes" title).
  await waitFor(
    () => {
      const body = document.body.textContent ?? "";
      assert.ok(
        body.includes("Unsaved changes"),
        `Expected restore dialog but got: "${body.slice(0, 400)}"`,
      );
    },
    { timeout: 5000 },
  );

  // Click "Restore" to apply the draft.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
  });

  // After restore the RichBodyEditor should contain the draft body text.
  await waitFor(
    () => {
      const body = document.body.textContent ?? "";
      assert.ok(
        body.includes(DRAFT_BODY),
        `Expected draft prose in UI after Restore, but got: "${body.slice(0, 400)}"`,
      );
    },
    { timeout: 5000 },
  );

  draftStoreSingleton.clear(SAFE);
  globalThis.sessionStorage.clear();
});
