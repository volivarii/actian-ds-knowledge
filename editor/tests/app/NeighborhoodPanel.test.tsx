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
    {
      source: "content:loading",
      target: "component:button",
      type: "related",
      note: "covers button spinners",
    },
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
  for (const banned of [
    "a11y_refs",
    "motion_refs",
    "slug",
    "related",
    "content:loading",
  ]) {
    assert.ok(!txt.includes(banned), `must not render "${banned}"`);
  }
  cleanup();
});

test("groups multiple incoming edge types under distinct human labels", () => {
  const ix = buildGraphIndex({
    nodes: [
      { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
      { id: "component:button", type: "component", title: "Button" },
      { id: "content:loading", type: "content_topic", title: "Loading states" },
    ],
    edges: [
      {
        source: "component:button",
        target: "a11y:contrast",
        type: "a11y_ref",
        note: null,
      },
      {
        source: "content:loading",
        target: "a11y:contrast",
        type: "related",
        note: null,
      },
    ],
  });
  const { getByText } = render(
    <Theme>
      <NeighborhoodPanel nodeId="a11y:contrast" index={ix} />
    </Theme>,
  );
  getByText(/Cited as an accessibility requirement by/i);
  getByText(/Related content/i);
  getByText("Button");
  getByText("Loading states");
  cleanup();
});

test("falls back to 'Untitled topic' when the source node is unknown (never the id)", () => {
  const ix = buildGraphIndex({
    nodes: [{ id: "component:button", type: "component", title: "Button" }],
    edges: [
      {
        source: "a11y:ghost",
        target: "component:button",
        type: "a11y_ref",
        note: null,
      },
    ],
  });
  const { getByText, queryByText } = render(
    <Theme>
      <NeighborhoodPanel nodeId="component:button" index={ix} />
    </Theme>,
  );
  getByText("Untitled topic");
  assert.equal(queryByText(/a11y:ghost/), null);
  cleanup();
});
