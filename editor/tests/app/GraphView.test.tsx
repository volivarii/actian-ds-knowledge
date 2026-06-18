// tests/app/GraphView.test.tsx
import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { GraphView } from "../../src/app/GraphView";
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
  getByRole("button", { name: /Contrast.*Accessibility criterion/i });
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
    getByRole("button", { name: /Toggle Accessibility criterion/i }),
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
  // hide Accessibility criterion nodes
  fireEvent.click(
    getByRole("button", { name: /Toggle Accessibility criterion/i }),
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
  // hide Accessibility criterion → removes edges to/from the a11y node
  fireEvent.click(
    getByRole("button", { name: /Toggle Accessibility criterion/i }),
  );
  const linesAfter = container.querySelectorAll("line").length;
  assert.ok(
    linesAfter < linesBefore,
    `edge count should drop after hiding a type (was ${linesBefore}, now ${linesAfter})`,
  );
  cleanup();
});
