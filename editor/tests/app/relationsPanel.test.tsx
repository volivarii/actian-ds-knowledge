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

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

const TEXT = "## Usage {#usage}\n\nBody.\n\n## Style {#style}\n\nMore.\n";

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
    container.textContent!.includes(
      "Use a button when the action is primary.",
    ),
  );
  const row = container.querySelectorAll("[data-testid='incoming-row']")[0]!;
  fireEvent.click(row);
  assert.ok(calls.includes("open:content/src/patterns/forms.md"));
});

test("graph rows show edge-type badge and the baked-staleness label", () => {
  const { container } = renderPanel();
  assert.ok(container.textContent!.includes("in_category"));
  assert.ok(container.textContent!.includes("Action"));
  assert.ok(container.textContent!.toLowerCase().includes("as of last merge"));
});

test("clicking an outline row scopes incoming to that section", () => {
  const { container } = renderPanel();
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
});

test("outgoing rows show the domain badge and slug; broken refs (null domain) are flagged", () => {
  const outgoing: OutgoingConnection[] = [
    { slug: "color-contrast", refType: "a11y_refs", note: null, domain: "accessibility" },
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
