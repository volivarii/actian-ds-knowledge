// tests/app/GraphView.test.tsx
import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { GraphView } from "../../src/app/GraphView";
import { linkLabel, THING_LABEL, LINK_LABEL } from "../../src/lib/nomenclature";
import { layoutNeighborhood } from "../../src/substrate/neighborhoodLayout";
import { buildGraphIndex } from "../../src/substrate/graphIndex";

const index = buildGraphIndex({
  nodes: [
    { id: "component:button", type: "component", title: "Button" },
    { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
    { id: "category:action", type: "category", title: "Action" },
  ],
  edges: [
    {
      source: "component:button",
      target: "a11y:contrast",
      type: "a11y_ref",
      note: "AA",
    },
    {
      source: "component:button",
      target: "category:action",
      type: "in_category",
    },
  ],
});
const layout = layoutNeighborhood("component:button", index, { depth: 1 });

// Index with a long-title node for P1 truncation tests
const longTitleIndex = buildGraphIndex({
  nodes: [
    { id: "component:button", type: "component", title: "Button" },
    {
      id: "a11y:very-long",
      type: "a11y_criterion",
      title: "Very Long Accessibility Criterion Name That Overflows",
    },
  ],
  edges: [
    {
      source: "component:button",
      target: "a11y:very-long",
      type: "a11y_ref",
      note: "AA",
    },
  ],
});
const longTitleLayout = layoutNeighborhood("component:button", longTitleIndex, {
  depth: 1,
});

function renderView(onFocusNode?: (id: string) => void, onReset?: () => void) {
  return render(
    <Theme>
      <GraphView layout={layout} onFocusNode={onFocusNode} onReset={onReset} />
    </Theme>,
  );
}

test("renders each placed node's title", () => {
  const { getAllByText } = renderView();
  // Each node title appears in both the SVG <text> (visible) and SVG <title> (tooltip).
  // getAllByText asserts at least one match exists.
  assert.ok(getAllByText("Button").length >= 1);
  assert.ok(getAllByText("Contrast").length >= 1);
  assert.ok(getAllByText("Action").length >= 1);
  cleanup();
});

test("nodes are focusable buttons whose accessible name includes the type, not color", () => {
  const { getByRole } = renderView();
  // aria-label carries the type → non-color encoding (WCAG 1.4.1)
  getByRole("button", { name: /Contrast.*Criterion/i });
  cleanup();
});

test("clicking a node re-roots via onFocusNode", () => {
  const calls: string[] = [];
  const { getByRole } = renderView((id) => calls.push(id));
  fireEvent.click(getByRole("button", { name: /Contrast/i }));
  assert.deepEqual(calls, ["a11y:contrast"]);
  cleanup();
});

test("toggling a node-type legend filter hides that type's nodes", () => {
  const { getByRole, queryAllByText, container } = renderView();
  // legend toggle is labeled with the human type label
  fireEvent.click(
    getByRole("button", { name: /Toggle Criterion/i }),
  );
  // After toggle, no SVG <text> element should render "Contrast"
  const svgTexts = Array.from(container.querySelectorAll("svg text"));
  const contrastText = svgTexts.find((el) => el.textContent === "Contrast");
  assert.equal(contrastText, undefined, "Contrast SVG text should be hidden");
  // Button node still has its SVG <text>
  const buttonText = svgTexts.find((el) => el.textContent === "Button");
  assert.ok(buttonText, "Button SVG text should still be present");
  cleanup();
});

test("doctrine: never renders raw ids or edge-type strings in textContent or aria-labels", () => {
  const { container } = renderView();
  // P3: check textContent
  const txt = container.textContent ?? "";
  for (const banned of ["component:button", "a11y_ref", "in_category"]) {
    assert.ok(!txt.includes(banned), `textContent must not render "${banned}"`);
  }
  // P3: check all aria-label attribute values
  const labeled = container.querySelectorAll("[aria-label]");
  for (const el of labeled) {
    const label = el.getAttribute("aria-label") ?? "";
    for (const banned of ["component:button", "a11y_ref", "in_category"]) {
      assert.ok(
        !label.includes(banned),
        `aria-label must not contain "${banned}" (found: "${label}")`,
      );
    }
  }
  cleanup();
});

// P1: long-title truncation
test("long node title is truncated in the SVG text element but full title is in aria-label", () => {
  const { container } = render(
    <Theme>
      <GraphView layout={longTitleLayout} />
    </Theme>,
  );
  const fullTitle = "Very Long Accessibility Criterion Name That Overflows";
  // The SVG <text> must be truncated (contain "…")
  const svgTexts = container.querySelectorAll("text");
  const longTextEl = Array.from(svgTexts).find((el) =>
    el.textContent?.includes("…"),
  );
  assert.ok(
    longTextEl,
    "a <text> element should contain '…' for the long title",
  );
  // The truncated text must NOT be the full title
  assert.ok(
    longTextEl!.textContent !== fullTitle,
    "the truncated text must differ from the full title",
  );
  // The aria-label on the node's <g> must still contain the full title
  const gButtons = container.querySelectorAll("[role='button']");
  const longNode = Array.from(gButtons).find((el) =>
    el.getAttribute("aria-label")?.includes(fullTitle),
  );
  assert.ok(longNode, "aria-label must contain the full title");
  cleanup();
});

// Feature: Reset button — filter cleared and onReset spy called
test("Reset view button clears the legend filter (hidden node reappears)", () => {
  const { getByRole, container } = renderView();
  function getSvgTextContents() {
    return Array.from(container.querySelectorAll("svg text")).map(
      (el) => el.textContent,
    );
  }
  // hide Criterion nodes
  fireEvent.click(
    getByRole("button", { name: /Toggle Criterion/i }),
  );
  assert.ok(
    !getSvgTextContents().includes("Contrast"),
    "node hidden after toggle",
  );
  // click Reset
  fireEvent.click(getByRole("button", { name: /Reset graph view/i }));
  assert.ok(
    getSvgTextContents().includes("Contrast"),
    "node reappears after Reset",
  );
  cleanup();
});

test("Reset view button calls onReset callback", () => {
  let resetCalls = 0;
  const { getByRole } = renderView(undefined, () => {
    resetCalls++;
  });
  fireEvent.click(getByRole("button", { name: /Reset graph view/i }));
  assert.equal(resetCalls, 1);
  cleanup();
});

// P2: edge-removal on legend filter
test("toggling a node type removes edges touching that type's nodes", () => {
  const { getByRole, container } = renderView();
  const linesBefore = container.querySelectorAll("line").length;
  assert.ok(linesBefore > 0, "there should be edges initially");
  // hide Criterion → removes edges to/from the a11y node
  fireEvent.click(
    getByRole("button", { name: /Toggle Criterion/i }),
  );
  const linesAfter = container.querySelectorAll("line").length;
  assert.ok(
    linesAfter < linesBefore,
    `edge count should drop after hiding a type (was ${linesBefore}, now ${linesAfter})`,
  );
  cleanup();
});

// ─── FEATURE A: Edge-type filter ────────────────────────────────────────────

// Build a multi-edge-type fixture: button→contrast (a11y_ref) + button→action (in_category)
// These are the same as the shared `index` / `layout` used above.

test("the edge legend speaks the nomenclature, not a private copy", () => {
  // EDGE_TYPE_LABEL was a fifth copy: six of the eleven real edge types were
  // missing so several filters read an indistinguishable "Related", and
  // motion_ref: "Motion" collided with the Thing word for motion_pattern —
  // putting two different controls called "Motion" in this view's two legends.
  assert.equal(linkLabel("a11y_ref", "out"), LINK_LABEL.compliance.out);
  assert.equal(linkLabel("in_category", "out"), LINK_LABEL.membership.out);
  assert.equal(linkLabel("related", "out"), LINK_LABEL.association.out);
  // The collision is gone: no edge word equals a Thing word.
  const things = new Set(Object.values(THING_LABEL));
  for (const t of ["a11y_ref", "foundations_ref", "motion_ref", "related", "in_category", "narrower"]) {
    assert.ok(
      !things.has(linkLabel(t, "out")),
      `edge "${t}" renders "${linkLabel(t, "out")}", which is also a Thing word`,
    );
  }
});

test("edge-type legend section renders with human labels, not raw keys", () => {
  const { container } = renderView();
  const toolbar = container.querySelector('[role="toolbar"]');
  assert.ok(toolbar, "toolbar should exist");
  const toolbarText = toolbar!.textContent ?? "";
  // Human labels should be present
  assert.ok(
    toolbarText.includes("Must follow"),
    'should show the compliance edge word',
  );
  assert.ok(toolbarText.includes("Category"), 'should show "Category" label');
  // Raw keys must NOT appear
  assert.ok(!toolbarText.includes("a11y_ref"), 'must not show raw "a11y_ref"');
  assert.ok(
    !toolbarText.includes("in_category"),
    'must not show raw "in_category"',
  );
  cleanup();
});

test("toggling an edge-type chip removes that type's lines", () => {
  const { getAllByRole, container } = renderView();
  const linesBefore = container.querySelectorAll("line").length;
  assert.ok(linesBefore > 0, "there should be edges initially");
  // toggle Accessibility (a11y_ref) edges off
  const btn = getAllByRole("button", {
    name: /Toggle Must follow relationships/i,
  });
  assert.ok(btn.length > 0, "edge-type toggle button should exist");
  fireEvent.click(btn[0]!);
  const linesAfter = container.querySelectorAll("line").length;
  assert.ok(
    linesAfter < linesBefore,
    `lines should drop after hiding a11y_ref edges (was ${linesBefore}, now ${linesAfter})`,
  );
  cleanup();
});

test("toggling an edge type hides floating (non-focus) nodes with no remaining edges", () => {
  // layout: button (focus) --a11y_ref--> contrast --in_category--> action
  // If we hide the a11y_ref edge type, contrast has no remaining edge to button,
  // so contrast (non-focus) should disappear. Button (focus) must stay.
  const { getAllByRole, container } = renderView();
  // Hide a11y_ref edges
  const btn = getAllByRole("button", {
    name: /Toggle Must follow relationships/i,
  });
  fireEvent.click(btn[0]!);
  const svgTexts = Array.from(container.querySelectorAll("svg text")).map(
    (el) => el.textContent,
  );
  assert.ok(
    !svgTexts.includes("Contrast"),
    "Contrast should be hidden (no remaining connection)",
  );
  assert.ok(svgTexts.includes("Button"), "Button (focus) must remain visible");
  cleanup();
});

test("Reset clears edge-type filter so hidden edge and its node reappear", () => {
  const { getAllByRole, getByRole, container } = renderView();
  function getSvgTexts() {
    return Array.from(container.querySelectorAll("svg text")).map(
      (el) => el.textContent,
    );
  }
  // Hide a11y_ref
  const btn = getAllByRole("button", {
    name: /Toggle Must follow relationships/i,
  });
  fireEvent.click(btn[0]!);
  assert.ok(
    !getSvgTexts().includes("Contrast"),
    "Contrast hidden after edge toggle",
  );
  // Reset
  fireEvent.click(getByRole("button", { name: /Reset graph view/i }));
  assert.ok(
    getSvgTexts().includes("Contrast"),
    "Contrast reappears after Reset",
  );
  cleanup();
});

// ─── FEATURE B: Arrow-key roving focus ─────────────────────────────────────

function getNodeGs(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[role='button']")).filter(
    (el) => el.closest("svg"),
  ) as HTMLElement[];
}

test("initially exactly one node has tabIndex=0, the rest have -1", () => {
  const { container } = renderView();
  const nodeGs = getNodeGs(container);
  assert.ok(nodeGs.length >= 2, "there should be at least 2 nodes");
  const zeros = nodeGs.filter((g) => g.tabIndex === 0);
  const negOnes = nodeGs.filter((g) => g.tabIndex === -1);
  assert.equal(zeros.length, 1, "exactly one node should have tabIndex=0");
  assert.equal(
    negOnes.length,
    nodeGs.length - 1,
    "remaining nodes should have tabIndex=-1",
  );
  cleanup();
});

test("focus node (isFocus=true) starts as the active node (tabIndex=0)", () => {
  const { container } = renderView();
  const nodeGs = getNodeGs(container);
  const activeNode = nodeGs.find((g) => g.tabIndex === 0);
  assert.ok(activeNode, "there should be an active node");
  // The focus node is "Button" (component:button is the focus)
  const ariaLabel = activeNode!.getAttribute("aria-label") ?? "";
  assert.ok(
    ariaLabel.includes("Button"),
    `focus node should be Button, got: ${ariaLabel}`,
  );
  cleanup();
});

test("ArrowRight moves tabIndex=0 to the next node", () => {
  const { container } = renderView();
  const nodeGs = getNodeGs(container);
  const firstActive = nodeGs.findIndex((g) => g.tabIndex === 0);
  assert.equal(firstActive, 0, "initially the first node should be active");
  fireEvent.keyDown(nodeGs[0]!, { key: "ArrowRight" });
  // After ArrowRight, the second node should now be tabIndex=0
  const updatedGs = getNodeGs(container);
  assert.equal(
    updatedGs[1]!.tabIndex,
    0,
    "second node should be active after ArrowRight",
  );
  assert.equal(
    updatedGs[0]!.tabIndex,
    -1,
    "first node should have tabIndex=-1 after ArrowRight",
  );
  cleanup();
});

test("clamps the active node when the visible set shrinks after a filter toggle", () => {
  const r = renderView();
  const before = getNodeGs(r.container);
  // Move the active node to the last of the three (Button → Contrast → Action).
  fireEvent.keyDown(before[0]!, { key: "ArrowRight" });
  const mid = getNodeGs(r.container);
  fireEvent.keyDown(mid[1]!, { key: "ArrowRight" });
  let gs = getNodeGs(r.container);
  assert.equal(
    gs[gs.length - 1]!.tabIndex,
    0,
    "last node active after two ArrowRights",
  );
  // Hiding the 'category' node type removes the Action node, shrinking the
  // visible set; the clamp must leave exactly one tabIndex=0 (no stale/
  // out-of-range active index, no element with multiple actives).
  // The two legends no longer share a word at all: the node-type chip is
  // "Toggle Category" and the edge chip is now "Toggle Part of relationships".
  // Before the nomenclature they were "Category" and "Category relationships",
  // and motion_ref/motion_pattern collided outright on "Motion".
  fireEvent.click(r.getByRole("button", { name: /^Toggle Category$/i }));
  gs = getNodeGs(r.container);
  const zeros = gs.filter((g) => g.tabIndex === 0);
  assert.equal(
    zeros.length,
    1,
    "exactly one node remains active after the visible set shrinks",
  );
  cleanup();
});

test("ArrowLeft wraps from first to last node", () => {
  const { container } = renderView();
  const nodeGs = getNodeGs(container);
  const n = nodeGs.length;
  fireEvent.keyDown(nodeGs[0]!, { key: "ArrowLeft" });
  const updatedGs = getNodeGs(container);
  assert.equal(
    updatedGs[n - 1]!.tabIndex,
    0,
    "last node should be active after ArrowLeft from first",
  );
  cleanup();
});

test("Home key moves active to first node", () => {
  const { container } = renderView();
  const nodeGs = getNodeGs(container);
  // First move to a later node
  fireEvent.keyDown(nodeGs[0]!, { key: "ArrowRight" });
  // Then press Home
  const afterArrow = getNodeGs(container);
  fireEvent.keyDown(afterArrow[1]!, { key: "Home" });
  const final = getNodeGs(container);
  assert.equal(final[0]!.tabIndex, 0, "first node should be active after Home");
  cleanup();
});

test("End key moves active to last node", () => {
  const { container } = renderView();
  const nodeGs = getNodeGs(container);
  const n = nodeGs.length;
  fireEvent.keyDown(nodeGs[0]!, { key: "End" });
  const updated = getNodeGs(container);
  assert.equal(
    updated[n - 1]!.tabIndex,
    0,
    "last node should be active after End",
  );
  cleanup();
});

test("Enter on a node still calls onFocusNode with its id", () => {
  const calls: string[] = [];
  const { container } = renderView((id) => calls.push(id));
  const nodeGs = getNodeGs(container);
  // Press ArrowRight to move to second node, then Enter
  fireEvent.keyDown(nodeGs[0]!, { key: "ArrowRight" });
  const updated = getNodeGs(container);
  const activeNode = updated.find((g) => g.tabIndex === 0);
  assert.ok(activeNode, "there should be an active node");
  fireEvent.keyDown(activeNode!, { key: "Enter" });
  assert.equal(calls.length, 1, "onFocusNode should have been called once");
  cleanup();
});

test("each node carries data-ref (its slug) so the map joins the cross-surface highlight", () => {
  const { container } = renderView();
  const nodeGs = getNodeGs(container);
  const focus = nodeGs.find((g) =>
    g.getAttribute("aria-label")?.includes("Button"),
  )!;
  // component:button -> data-ref "button", matching the inline link + rail row
  assert.equal(focus.getAttribute("data-ref"), "button");
  const contrast = nodeGs.find((g) =>
    g.getAttribute("aria-label")?.includes("Contrast"),
  )!;
  assert.equal(contrast.getAttribute("data-ref"), "contrast");
});

test("compact mode hides the filter toolbar but still renders the graph", () => {
  const { container } = render(
    <Theme>
      <GraphView layout={layout} compact />
    </Theme>,
  );
  assert.equal(
    container.querySelector('[role="toolbar"]'),
    null,
    "no filter toolbar in compact mode",
  );
  assert.ok(container.querySelector("svg"), "svg still renders");
  cleanup();
});
