import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { MarkdownEditScreen } from "../../src/app/MarkdownEditScreen";
import { setWysiwygFlag, assertNoElement } from "../helpers/editorSurface";

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

// A registry-safe component guideline file (slice 3). Body shape mirrors a
// real content.md: an H2 section with a Do/Don't table.
const COMPONENT_SAFE = "components/src/button/content.md";
const FILE =
  "## Microcopy\n\nKeep labels short.\n\n| Do | Don't |\n|---|---|\n| Save | Submit form now |\n";

test("SAFE component guideline file renders RichBodyEditor when the flag is on", async () => {
  cleanup();
  setWysiwygFlag("rich");
  render(
    <Theme>
      <MarkdownEditScreen path={COMPONENT_SAFE} octokit={fakeGh(FILE)} />
    </Theme>,
  );
  await waitFor(
    () => assert.ok(screen.getByRole("textbox", { name: /body editor/i })),
    { timeout: 5000 },
  );
  cleanup();
});

// "Off" has to be STATED: clearing storage stopped meaning off once the flag
// became an opt-out.
test("flag OFF -> CodeMirror for a component guideline file (no body-editor role)", async () => {
  cleanup();
  setWysiwygFlag("source");
  render(
    <Theme>
      <MarkdownEditScreen path={COMPONENT_SAFE} octokit={fakeGh(FILE)} />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.getByText(COMPONENT_SAFE)), {
    timeout: 5000,
  });
  assertNoElement(
    screen.queryByRole("textbox", { name: /body editor/i }),
    "flag-off must use CodeMirror",
  );
  cleanup();
});
