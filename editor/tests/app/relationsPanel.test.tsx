// RelationsPanel: the unified outline + contextual relations surface that
// Tasks 5-6 mount in source mode, rich mode, and the frontmatter-form body
// view. Tests target the component in isolation with fake props (the panel
// never calls the reference/graph services itself, per the prop contract).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { RelationsPanel } from "../../src/app/RelationsPanel";
import type { IncomingRef, Neighbor } from "../../src/lib/referenceIndex";
import type { OutgoingConnection } from "../../src/substrate/refGraph";
import type { Heading } from "../../src/lib/headingScan";

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

const TEXT = "## Usage {#usage}\n\nBody.\n\n## Style {#style}\n\nMore.\n";

const H1_FIRST_TEXT = "# Title\n\n## Usage {#usage}\n\nBody.\n";

const INCOMING: IncomingRef[] = [
  {
    fromPath: "content/src/patterns/forms.md",
    slug: "usage",
    snippet: "Use a button when the action is primary.",
  },
];

const OUTGOING: OutgoingConnection[] = [];

const GRAPH_NEIGHBORS: Neighbor[] = [
  {
    id: "category:action",
    node: { id: "category:action", type: "category", title: "Action" },
    edgeType: "in_category",
    note: null,
    direction: "out",
  },
];

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof RelationsPanel>> = {},
) {
  const calls: string[] = [];
  const utils = render(
    <Theme>
      <RelationsPanel
        text={TEXT}
        file="components/src/button/content.md"
        counts={new Map([["usage", 3]])}
        incoming={INCOMING}
        outgoing={OUTGOING}
        graphNeighbors={GRAPH_NEIGHBORS}
        onNavigate={() => calls.push("nav")}
        onOpenFile={(p) => calls.push("open:" + p)}
        onManageConnections={() => calls.push("manage")}
        {...overrides}
      />
    </Theme>,
  );
  return { ...utils, calls };
}

test("renders outline headings with count pills", () => {
  const { container } = renderPanel();
  assert.ok(container.textContent!.includes("Usage"));
  assert.ok(container.textContent!.includes("Style"));
  assert.ok(container.textContent!.includes("3"));
});

test("incoming rows show snippet and source file, click opens the file", () => {
  const { container, calls } = renderPanel();
  assert.ok(
    container.textContent!.includes("Use a button when the action is primary."),
  );
  const row = container.querySelectorAll("[data-testid='incoming-row']")[0]!;
  fireEvent.click(row);
  assert.ok(calls.includes("open:content/src/patterns/forms.md"));
});

test("incoming row responds to an Enter keydown the same as a click", () => {
  const { container, calls } = renderPanel();
  const row = container.querySelectorAll("[data-testid='incoming-row']")[0]!;
  fireEvent.keyDown(row, { key: "Enter" });
  assert.ok(calls.includes("open:content/src/patterns/forms.md"));
});

test("graph rows show edge-type badge and the baked-staleness label", () => {
  const { container } = renderPanel();
  assert.ok(container.textContent!.includes("in_category"));
  assert.ok(container.textContent!.includes("Action"));
  assert.ok(container.textContent!.toLowerCase().includes("as of last merge"));
});

test("clicking an outline row scopes incoming to that section", () => {
  const navCalls: Heading[] = [];
  const { container } = renderPanel({
    onNavigate: (h) => navCalls.push(h),
  });
  const styleRow = Array.from(
    container.querySelectorAll("[data-testid='outline-row']"),
  ).find((r) => r.textContent!.includes("Style"))!;
  fireEvent.click(styleRow);
  // "usage"-slugged incoming ref is hidden when the Style section is scoped.
  assert.ok(
    !container.textContent!.includes(
      "Use a button when the action is primary.",
    ),
  );
  assert.equal(navCalls.length, 1);
  assert.equal(navCalls[0]!.text, "Style");
});

test("H1 outline row click navigates without touching section scoping; Manage falls back to the first H2/H3 anchor", () => {
  const navCalls: Heading[] = [];
  const manageCalls: string[] = [];
  const { container } = render(
    <Theme>
      <RelationsPanel
        text={H1_FIRST_TEXT}
        file="components/src/button/content.md"
        counts={new Map()}
        incoming={INCOMING}
        outgoing={[]}
        graphNeighbors={[]}
        onNavigate={(h) => navCalls.push(h)}
        onOpenFile={() => {}}
        onManageConnections={(anchor) => manageCalls.push(anchor)}
      />
    </Theme>,
  );

  const rows = () =>
    Array.from(container.querySelectorAll("[data-testid='outline-row']"));
  const titleRow = rows().find((r) => r.textContent!.includes("Title"))!;
  const usageRow = rows().find((r) => r.textContent!.includes("Usage"))!;

  // Scope to "usage" first, via a real H2 row.
  fireEvent.click(usageRow);
  assert.ok(container.textContent!.includes("Relations: usage"));

  // Clicking the H1 row navigates, but H1 has no anchor, so scoping is
  // left untouched (not cleared).
  fireEvent.click(titleRow);
  assert.equal(navCalls.length, 2);
  assert.equal(navCalls[1]!.text, "Title");
  assert.equal(navCalls[1]!.level, 1);
  assert.ok(container.textContent!.includes("Relations: usage"));

  // Unscope, then Manage falls back to the first H2/H3 heading's anchor
  // ("usage"), not headings[0] (the H1, which resolves to a null anchor).
  fireEvent.click(screen.getByText("All"));
  fireEvent.click(screen.getByTestId("manage-connections"));
  assert.equal(manageCalls.length, 1);
  assert.equal(manageCalls[0], "usage");
});

test("outgoing rows show the domain badge and slug; broken refs (null domain) are flagged", () => {
  const outgoing: OutgoingConnection[] = [
    {
      slug: "color-contrast",
      refType: "a11y_refs",
      note: null,
      domain: "accessibility",
    },
    { slug: "ghost-topic", refType: "motion_refs", note: null, domain: null },
  ];
  const { container } = renderPanel({ outgoing });
  assert.ok(container.textContent!.includes("accessibility"));
  assert.ok(container.textContent!.includes("color-contrast"));
  assert.ok(container.textContent!.includes("broken"));
  assert.ok(container.textContent!.includes("ghost-topic"));
});

test("manage connections click passes the scoped (or first) section anchor and the anchor element", () => {
  const calls: Array<{ anchor: string; el: HTMLElement }> = [];
  render(
    <Theme>
      <RelationsPanel
        text={TEXT}
        file="components/src/button/content.md"
        counts={new Map()}
        incoming={[]}
        outgoing={[]}
        graphNeighbors={[]}
        onNavigate={() => {}}
        onOpenFile={() => {}}
        onManageConnections={(anchor, el) => calls.push({ anchor, el })}
      />
    </Theme>,
  );
  fireEvent.click(screen.getByTestId("manage-connections"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.anchor, "usage");
  assert.ok(calls[0]!.el instanceof HTMLElement);
});

test("Manage button is absent when onManageConnections is omitted", () => {
  render(
    <Theme>
      <RelationsPanel
        text={TEXT}
        file="components/src/button/content.md"
        counts={new Map()}
        incoming={[]}
        outgoing={[]}
        graphNeighbors={[]}
        onNavigate={() => {}}
        onOpenFile={() => {}}
      />
    </Theme>,
  );
  assert.equal(screen.queryByTestId("manage-connections"), null);
});

test("collapse toggle hides the outline and contextual relations, keeps the header", () => {
  const { container } = renderPanel();
  assert.ok(container.textContent!.includes("Usage"));
  fireEvent.click(screen.getByLabelText("Toggle relations panel"));
  assert.ok(!container.textContent!.includes("Usage"));
  assert.ok(!container.textContent!.includes("Incoming"));
});

test("collapsed preference persists to localStorage and a fresh render starts collapsed", () => {
  const { container } = renderPanel();
  fireEvent.click(screen.getByLabelText("Toggle relations panel"));
  assert.equal(localStorage.getItem("relationsPanelCollapsed"), "1");
  assert.ok(!container.textContent!.includes("Usage"));

  cleanup();

  // Fresh mount: localStorage already says collapsed, so it starts collapsed.
  const { container: container2 } = renderPanel();
  assert.ok(!container2.textContent!.includes("Usage"));
});
