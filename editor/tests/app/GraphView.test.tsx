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
    { source: "component:button", target: "a11y:contrast", type: "a11y_ref", note: "AA" },
    { source: "component:button", target: "category:action", type: "in_category" },
  ],
});
const layout = layoutNeighborhood("component:button", index, { depth: 1 });

function renderView(onFocusNode?: (id: string) => void) {
  return render(
    <Theme>
      <GraphView layout={layout} onFocusNode={onFocusNode} />
    </Theme>,
  );
}

test("renders each placed node's title", () => {
  const { getByText } = renderView();
  getByText("Button");
  getByText("Contrast");
  getByText("Action");
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
  const { getByRole, queryByText } = renderView();
  // legend toggle is labeled with the human type label
  fireEvent.click(getByRole("button", { name: /Toggle Accessibility criterion/i }));
  assert.equal(queryByText("Contrast"), null);
  queryByText("Button"); // still present
  cleanup();
});

test("doctrine: never renders raw ids or edge-type strings", () => {
  const { container } = renderView();
  const txt = container.textContent ?? "";
  for (const banned of ["component:button", "a11y_ref", "in_category"]) {
    assert.ok(!txt.includes(banned), `must not render "${banned}"`);
  }
  cleanup();
});
