// tests/app/EditorShell.relationships-tab.test.tsx
import { test } from "node:test";
import "../setup-dom";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { EditorShell } from "../../src/app/EditorShell";

// A minimal Octokit stub — EditorShell only needs an object for the landing
// dashboards' lazy data loads, which we don't trigger here (we click the
// Relationships tab, whose data is baked, not fetched).
const octokit = {} as never;

test("landing surface exposes a third Relationships tab that renders the health view", () => {
  const { getByRole, getByText } = render(
    <Theme>
      <EditorShell
        octokit={octokit}
        activePath={null}
        setActivePath={() => {}}
      />
    </Theme>,
  );
  const trigger = getByRole("tab", { name: /Relationships/i });
  // Radix Tabs.Trigger activates on mousedown (not click) — see @radix-ui/react-tabs source.
  fireEvent.mouseDown(trigger);
  getByText(/Substrate relationship health/i); // GraphHealthTab intro copy
  cleanup();
});
