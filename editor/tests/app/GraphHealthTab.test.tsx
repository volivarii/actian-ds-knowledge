// tests/app/GraphHealthTab.test.tsx
import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { GraphHealthTab } from "../../src/app/GraphHealthTab";
import { SCREEN_TITLE } from "../../src/lib/routes";

/**
 * The screen reads the graph from module-stable data, and the application-context
 * block reads the substrate through Octokit. These tests are about the graph
 * half, so the client refuses every path: the meters block then renders its own
 * error callout in place, which is the behaviour that keeps one failing section
 * from taking the screen down.
 *
 * NOT `undefined`: `loadPatternIndex(undefined)` throws on a property of
 * undefined, which is the same red callout for a different reason and would let
 * a real wiring break hide behind a passing test.
 */
function offlineOctokit() {
  return {
    repos: {
      getContent: async () => {
        const e = new Error("offline in this test") as Error & { status: number };
        e.status = 404;
        throw e;
      },
      listCommits: async () => ({ data: [] }),
    },
    git: {},
    pulls: {},
  } as never;
}

function renderTab(onOpenFile: (p: string) => void = () => {}) {
  return render(
    <Theme>
      <GraphHealthTab octokit={offlineOctokit()} onOpenFile={onOpenFile} />
    </Theme>,
  );
}

test("renders the connectivity metrics from the baked quality report", () => {
  const { getByText } = renderTab();
  getByText(/Orphan nodes/i);
  getByText(SCREEN_TITLE.health); // the screen heading, from the one map
  cleanup();
});

test("renders a hub table and excludes asset categories (no Icons row)", () => {
  const { queryByText, getAllByRole } = renderTab();
  // The 235-strong category:icons hub must NOT appear — it's filtered out.
  assert.equal(queryByText(/^Icons$/), null);
  assert.ok(getAllByRole("row").length > 1);
  cleanup();
});

test("clicking a hub row's Open opens its editor target", () => {
  const opened: string[] = [];
  const { getAllByRole } = renderTab((p) => opened.push(p));
  const openButtons = getAllByRole("button", { name: /Open in editor/i });
  fireEvent.click(openButtons[0]!);
  assert.equal(opened.length, 1);
  assert.ok(opened[0]!.length > 0);
  cleanup();
});

test("focusing a hub renders the explorer graph centered on it", () => {
  const { getAllByRole, getByLabelText } = renderTab();
  const exploreButtons = getAllByRole("button", { name: /Explore/i });
  fireEvent.click(exploreButtons[0]!);
  // GraphView exposes an aria-label "Relationship graph centered on <title>"
  getByLabelText(/Relationship graph centered on/i);
  cleanup();
});
