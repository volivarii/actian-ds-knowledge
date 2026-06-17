import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { NeighborhoodPanel } from "../../src/app/NeighborhoodPanel";
import { buildGraphIndex } from "../../src/substrate/graphIndex";

const index = buildGraphIndex({
  nodes: [
    { id: "component:button", type: "component", title: "Button" },
    { id: "content:loading", type: "content_topic", title: "Loading states" },
    { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
  ],
  edges: [
    { source: "content:loading", target: "component:button", type: "related", note: "covers button spinners" },
  ],
});

function renderPanel(nodeId: string) {
  return render(
    <Theme>
      <NeighborhoodPanel nodeId={nodeId} index={index} />
    </Theme>,
  );
}

test("renders incoming neighbor titles (not ids), with the edge note", () => {
  const { getByText, queryByText } = renderPanel("component:button");
  getByText("Loading states");
  getByText(/covers button spinners/);
  assert.equal(queryByText(/content:loading/), null);
  cleanup();
});

test("empty state when nothing references the node", () => {
  const { getByText } = renderPanel("a11y:contrast");
  getByText(/Nothing references this yet/i);
  cleanup();
});

test("doctrine: never renders raw edge-type or identifier strings", () => {
  const { container } = renderPanel("component:button");
  const txt = container.textContent ?? "";
  for (const banned of ["a11y_refs", "motion_refs", "slug", "related", "content:loading"]) {
    assert.ok(!txt.includes(banned), `must not render "${banned}"`);
  }
  cleanup();
});
