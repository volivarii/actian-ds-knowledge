// RelationsPanel: the unified outline + contextual relations surface that
// Tasks 5-6 mount in source mode, rich mode, and the frontmatter-form body
// view. Tests target the component in isolation with fake props (the panel
// never calls the reference/graph services itself, per the prop contract).
// `collapsed` is a controlled prop owned by the parent screen (FIX 1): the
// panel itself no longer reads/writes localStorage, so these tests drive
// visibility via the prop and separately pin the exported storage util.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import {
  RelationsPanel,
  readRelationsPanelCollapsed,
  writeRelationsPanelCollapsed,
} from "../../src/app/RelationsPanel";
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
        collapsed={false}
        onToggleCollapsed={() => calls.push("toggle")}
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
  const usageRow = Array.from(
    container.querySelectorAll("[data-testid='outline-row']"),
  ).find((r) => r.textContent!.includes("Usage"))!;
  const badge = usageRow.querySelector("[data-testid='outline-count']");
  assert.ok(badge);
  assert.equal(badge!.textContent, "3");
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

test("graph rows show a space-separated edge-type badge and the baked-staleness label", () => {
  const { container } = renderPanel();
  assert.ok(container.textContent!.includes("in category"));
  assert.ok(!container.textContent!.includes("in_category"));
  assert.ok(container.textContent!.includes("Action"));
  assert.ok(container.textContent!.toLowerCase().includes("as of last merge"));
});

test("graph row navigates via onOpenFile when navTargetForNodeId resolves; a node type mapping to null stays non-interactive", () => {
  const neighbors: Neighbor[] = [
    {
      id: "category:action",
      node: { id: "category:action", type: "category", title: "Action" },
      edgeType: "in_category",
      note: null,
      direction: "out",
    },
    {
      id: "content:loading",
      node: { id: "content:loading", type: "content", title: "Loading" },
      edgeType: "uses_pattern",
      note: null,
      direction: "out",
    },
  ];
  const { container, calls } = renderPanel({ graphNeighbors: neighbors });
  const rows = Array.from(
    container.querySelectorAll("[data-testid='graph-row']"),
  );
  const categoryRow = rows.find((r) => r.textContent!.includes("Action"))!;
  const contentRow = rows.find((r) => r.textContent!.includes("Loading"))!;

  assert.equal(categoryRow.getAttribute("role"), "button");
  fireEvent.click(categoryRow);
  assert.ok(calls.includes("open:components/src/categories/action.md"));

  assert.notEqual(contentRow.getAttribute("role"), "button");
  fireEvent.click(contentRow);
  assert.ok(!calls.some((c) => c.startsWith("open:") && c.includes("loading")));
});

test("clicking an outline row scopes incoming to that section, and passes its index", () => {
  const navCalls: Array<{ heading: Heading; index: number }> = [];
  const { container } = renderPanel({
    onNavigate: (heading, index) => navCalls.push({ heading, index }),
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
  assert.equal(navCalls[0]!.heading.text, "Style");
  // "Style" is the second heading (index 1) in TEXT's outline.
  assert.equal(navCalls[0]!.index, 1);
});

test("H1 outline row click navigates without touching section scoping; Manage falls back to the first H2/H3 anchor", () => {
  const navCalls: Array<{ heading: Heading; index: number }> = [];
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
        onNavigate={(heading, index) => navCalls.push({ heading, index })}
        onOpenFile={() => {}}
        onManageConnections={(anchor) => manageCalls.push(anchor)}
        collapsed={false}
        onToggleCollapsed={() => {}}
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
  assert.equal(navCalls[1]!.heading.text, "Title");
  assert.equal(navCalls[1]!.heading.level, 1);
  // "Title" is the first heading (index 0) in H1_FIRST_TEXT's outline.
  assert.equal(navCalls[1]!.index, 0);
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

test("outgoing rows navigate by domain: component → workspace, accessibility → src path; broken and motion stay plain", () => {
  const outgoing: OutgoingConnection[] = [
    {
      slug: "tag",
      refType: "relatedComponents",
      note: null,
      domain: "component",
    },
    {
      slug: "color-contrast",
      refType: "a11y_refs",
      note: null,
      domain: "accessibility",
    },
    { slug: "fade-in", refType: "motion_refs", note: null, domain: "motion" },
    { slug: "ghost-topic", refType: "a11y_refs", note: null, domain: null },
  ];
  const { container, calls } = renderPanel({ outgoing });
  const rows = Array.from(
    container.querySelectorAll("[data-testid='outgoing-row']"),
  );
  assert.equal(rows.length, 4);

  const rowFor = (slug: string) =>
    rows.find((r) => r.textContent!.includes(slug))!;

  fireEvent.click(rowFor("tag"));
  fireEvent.click(rowFor("color-contrast"));
  assert.deepEqual(calls, [
    "open:workspace/tag",
    "open:accessibility/src/color-contrast.md",
  ]);

  // motion and broken rows are non-interactive (no role, click is a no-op)
  assert.equal(rowFor("fade-in").getAttribute("role"), null);
  assert.equal(rowFor("ghost-topic").getAttribute("role"), null);
  fireEvent.click(rowFor("fade-in"));
  fireEvent.click(rowFor("ghost-topic"));
  assert.equal(calls.length, 2);
});

test("outgoing row responds to Enter like a click", () => {
  const outgoing: OutgoingConnection[] = [
    {
      slug: "tag",
      refType: "relatedComponents",
      note: null,
      domain: "component",
    },
  ];
  const { container, calls } = renderPanel({ outgoing });
  const row = container.querySelector("[data-testid='outgoing-row']")!;
  fireEvent.keyDown(row, { key: "Enter" });
  assert.deepEqual(calls, ["open:workspace/tag"]);
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
        collapsed={false}
        onToggleCollapsed={() => {}}
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
        collapsed={false}
        onToggleCollapsed={() => {}}
      />
    </Theme>,
  );
  assert.equal(screen.queryByTestId("manage-connections"), null);
});

test("clicking the toggle button calls onToggleCollapsed (collapsed state is owned by the parent)", () => {
  const { calls } = renderPanel();
  fireEvent.click(screen.getByLabelText("Toggle relations panel"));
  assert.ok(calls.includes("toggle"));
});

test("collapsed=true hides the outline and contextual relations, keeps the header", () => {
  const { container } = renderPanel({ collapsed: true });
  assert.ok(container.textContent!.includes("Relations"));
  assert.ok(!container.textContent!.includes("Usage"));
  assert.ok(!container.textContent!.includes("Incoming"));
});

test("readRelationsPanelCollapsed / writeRelationsPanelCollapsed round-trip through localStorage", () => {
  assert.equal(readRelationsPanelCollapsed(), false);
  writeRelationsPanelCollapsed(true);
  assert.equal(localStorage.getItem("relationsPanelCollapsed"), "1");
  assert.equal(readRelationsPanelCollapsed(), true);
  writeRelationsPanelCollapsed(false);
  assert.equal(localStorage.getItem("relationsPanelCollapsed"), "0");
  assert.equal(readRelationsPanelCollapsed(), false);
});

test("outline renders nothing when text has no headings", () => {
  const { container } = renderPanel({ text: "just prose, no headings" });
  // Empty outline renders without crashing; no heading rows present.
  assert.equal(
    container.querySelectorAll("[data-testid='outline-row']").length,
    0,
  );
});

test("outline indentation: H2 deeper than H1, H3 deeper than H2", () => {
  const md = "# Top\n## Section\n### Sub\n";
  const { container } = renderPanel({ text: md });
  const items = container.querySelectorAll("[data-testid='outline-row']");
  assert.equal(items.length, 3);
  const pads = Array.from(items).map((el) =>
    parseFloat((el as HTMLElement).style.paddingLeft),
  );
  // H1 < H2 < H3 indent
  assert.ok(pads[0]! < pads[1]!);
  assert.ok(pads[1]! < pads[2]!);
});

test("activeAnchor marks the matching outline row (data-active) without scoping the incoming list", () => {
  const { container } = renderPanel({ activeAnchor: "style" });
  const rows = Array.from(
    container.querySelectorAll("[data-testid='outline-row']"),
  ) as HTMLElement[];
  const styleRow = rows.find((r) => r.textContent!.includes("Style"))!;
  const usageRow = rows.find((r) => r.textContent!.includes("Usage"))!;
  assert.equal(styleRow.getAttribute("data-active"), "true");
  assert.equal(usageRow.getAttribute("data-active"), null);
  // Active is a passive marker: the "usage"-slugged incoming ref stays visible
  // (activeAnchor never filters Incoming the way a clicked row does).
  assert.ok(
    container.textContent!.includes("Use a button when the action is primary."),
  );
});

test("activeAnchor of null (rich mode) marks no outline row", () => {
  const { container } = renderPanel({ activeAnchor: null });
  const active = container.querySelectorAll("[data-active='true']");
  assert.equal(active.length, 0);
});

test("empty Referenced-by / References / graph groups render a zero-count affordance", () => {
  const { container } = renderPanel({
    incoming: [],
    outgoing: [],
    graphNeighbors: [],
  });
  assert.ok(container.querySelector("[data-testid='incoming-empty']"));
  assert.ok(container.querySelector("[data-testid='outgoing-empty']"));
  assert.ok(container.querySelector("[data-testid='graph-empty']"));
  // Outgoing empty text nudges toward the Manage flow when it is wired.
  assert.ok(container.textContent!.includes("Manage"));
});

test("outgoing empty affordance omits the Manage nudge when onManageConnections is absent", () => {
  const { container } = render(
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
        collapsed={false}
        onToggleCollapsed={() => {}}
      />
    </Theme>,
  );
  const empty = container.querySelector("[data-testid='outgoing-empty']")!;
  assert.equal(empty.textContent, "No references yet.");
});

test("relation group labels use author-facing vocabulary (Referenced by / References)", () => {
  const { container } = renderPanel();
  assert.ok(container.textContent!.includes("Referenced by"));
  assert.ok(container.textContent!.includes("References"));
  assert.ok(!container.textContent!.includes("Incoming"));
  assert.ok(!container.textContent!.includes("Outgoing"));
});
