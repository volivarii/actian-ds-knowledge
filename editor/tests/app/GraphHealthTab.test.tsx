// tests/app/GraphHealthTab.test.tsx
import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { GraphHealthTab, orphanCapNote } from "../../src/app/GraphHealthTab";
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

// ── #697: an empty cell does not state its cause ────────────────────────────
//
// Every Criterion orphan carries "Open in editor"; every Term orphan carried
// nothing at all, because `navTargetForNodeId` has no `term:` case. Terms are
// not merely unmapped — `app-context/src/terminology.yml` matches no entry in
// the frontmatterForms registry, so it would land on the RefusalBanner if it
// were mapped. The honest fix is to say so, not to invent a destination.

test("an orphan the editor cannot open says so, instead of rendering a blank cell", () => {
  const { container } = renderTab();
  // Read the Type cell, not the row's concatenated text: cell boundaries
  // vanish in textContent, so "Access Request Policy" + "Term" reads as
  // "…PolicyTerm" and a word-boundary match on the row finds nothing.
  const rows = Array.from(container.querySelectorAll("tbody tr"));
  const termRows = rows.filter(
    (r) => r.querySelectorAll("td")[0]?.textContent?.trim() === "Term",
  );
  assert.ok(
    termRows.length > 0,
    "the baked graph should carry orphaned terms; if it stops, this test needs a new subject",
  );
  for (const r of termRows) {
    assert.equal(
      /No editor surface/.test(r.textContent ?? ""),
      true,
      `a term orphan row must state why it offers no action, got: ${r.textContent}`,
    );
  }
  cleanup();
});

test("no row both offers Open in editor and claims it has no surface", () => {
  const { container } = renderTab();
  for (const r of Array.from(container.querySelectorAll("tbody tr"))) {
    const t = r.textContent ?? "";
    assert.equal(
      /Open in editor/.test(t) && /No editor surface/.test(t),
      false,
      `a row said both things: ${t}`,
    );
  }
  cleanup();
});

test("orphanCapNote: states the cap when it truncates, and says nothing when it does not", () => {
  // The table caps at 30. Today there are 29 orphans, so the cap does not bite
  // and the screen must stay silent; at 31 it must say what it withheld rather
  // than showing 30 and reporting nothing.
  assert.equal(orphanCapNote(41, 30), "Showing the first 30 of 41.");
  assert.equal(orphanCapNote(30, 30), null);
  assert.equal(orphanCapNote(29, 30), null);
  assert.equal(orphanCapNote(0, 30), null);
});
