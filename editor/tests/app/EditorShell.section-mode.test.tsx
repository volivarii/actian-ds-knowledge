import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { EditorShell } from "../../src/app/EditorShell";

afterEach(cleanup);

// Smoke tests for the right-pane tab toggle introduced by T9.
//
// EditorShell now accepts a `focusedSection` prop that determines the
// initial active tab of the right-pane Tabs.Root. The existing shell
// wiring (auth, vendor loading, GitHub API) is bypassed by leaving the
// other props optional — the tabs render BEFORE the gh check, so the
// no-octokit branch still surfaces the tab UI for the smoke assertions.

test("EditorShell: right pane shows 'File' mode by default", () => {
  localStorage.clear();
  render(
    <Theme>
      <EditorShell focusedSection={null} />
    </Theme>,
  );
  const fileTab = screen.getByRole("tab", { name: /file/i });
  // Radix sets data-state="active" on the active trigger
  assert.equal(fileTab.getAttribute("data-state"), "active");
});

test("EditorShell: right pane auto-switches to Section mode when a section is focused", () => {
  localStorage.clear();
  render(
    <Theme>
      <EditorShell
        focusedSection={{
          file: "foundations/src/04.md",
          anchor: "color-usage-rules",
          level: 3,
          line: 12,
        }}
      />
    </Theme>,
  );
  const sectionTab = screen.getByRole("tab", { name: /section/i });
  assert.equal(sectionTab.getAttribute("data-state"), "active");
});

test("EditorShell: tab toggle lets user flip back to File mode manually", () => {
  localStorage.clear();
  render(
    <Theme>
      <EditorShell
        focusedSection={{
          file: "foundations/src/04.md",
          anchor: "color-usage-rules",
          level: 3,
          line: 12,
        }}
      />
    </Theme>,
  );
  const fileTab = screen.getByRole("tab", { name: /file/i });
  // Radix Tabs.Trigger activates on mousedown (it's a roving-focus
  // primitive), so a plain `click` doesn't change selection in jsdom.
  fireEvent.mouseDown(fileTab);
  fireEvent.click(fileTab);
  assert.equal(fileTab.getAttribute("data-state"), "active");
});
