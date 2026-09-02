import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { NeighborhoodPanel } from "../../src/app/NeighborhoodPanel";
import { buildGraphIndex } from "../../src/substrate/graphIndex";
import type { GraphInput } from "../../src/substrate/graphIndex";

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
  // One vocabulary: an inbound a11y_ref is "Required by" and an inbound
  // `related` is "Related to", the same words the relations rail uses.
  getByText(/Required by/i);
  getByText(/Related to/i);
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

test("resolvable referrer renders a button that navigates on click", () => {
  const ix = buildGraphIndex({
    nodes: [
      { id: "a11y:forms", type: "a11y_criterion", title: "Forms" },
      { id: "component:button", type: "component", title: "Button" },
    ],
    edges: [
      {
        source: "component:button",
        target: "a11y:forms",
        type: "a11y_ref",
        note: null,
      },
    ],
  });
  const calls: string[] = [];
  const { getByRole } = render(
    <Theme>
      <NeighborhoodPanel
        nodeId="a11y:forms"
        index={ix}
        onNavigate={(p) => calls.push(p)}
      />
    </Theme>,
  );
  const btn = getByRole("button", { name: "Button" });
  fireEvent.click(btn);
  assert.deepEqual(calls, ["workspace/button"]);
  cleanup();
});

test("non-navigable referrer (content) stays read-only text, no button", () => {
  const ix = buildGraphIndex({
    nodes: [
      { id: "component:button", type: "component", title: "Button" },
      { id: "content:loading", type: "content_topic", title: "Loading states" },
    ],
    edges: [
      {
        source: "content:loading",
        target: "component:button",
        type: "related",
        note: null,
      },
    ],
  });
  const { getByText, queryByRole } = render(
    <Theme>
      <NeighborhoodPanel
        nodeId="component:button"
        index={ix}
        onNavigate={() => {}}
      />
    </Theme>,
  );
  getByText("Loading states");
  assert.equal(queryByRole("button", { name: "Loading states" }), null);
  cleanup();
});

test("without onNavigate, even resolvable titles are read-only (no buttons)", () => {
  const ix = buildGraphIndex({
    nodes: [
      { id: "a11y:forms", type: "a11y_criterion", title: "Forms" },
      { id: "component:button", type: "component", title: "Button" },
    ],
    edges: [
      {
        source: "component:button",
        target: "a11y:forms",
        type: "a11y_ref",
        note: null,
      },
    ],
  });
  const { getByText, queryByRole } = render(
    <Theme>
      <NeighborhoodPanel nodeId="a11y:forms" index={ix} />
    </Theme>,
  );
  getByText("Button");
  assert.equal(queryByRole("button", { name: "Button" }), null);
  cleanup();
});

test("caps a large group and reveals the rest via Show all", () => {
  // typed so the loop-built arrays survive tsc (existing tests inline literals)
  const nodes: GraphInput["nodes"] = [
    { id: "category:icons", type: "category", title: "Icons" },
  ];
  const edges: GraphInput["edges"] = [];
  for (let n = 0; n < 12; n++) {
    nodes.push({
      id: `component:c${n}`,
      type: "component",
      title: `Comp ${n}`,
    });
    edges.push({
      source: `component:c${n}`,
      target: "category:icons",
      type: "in_category",
      note: null,
    });
  }
  const ix = buildGraphIndex({ nodes, edges });
  const { getByRole, queryByText, getByText } = render(
    <Theme>
      <NeighborhoodPanel nodeId="category:icons" index={ix} />
    </Theme>,
  );
  getByText("Comp 0");
  assert.equal(queryByText("Comp 11"), null);
  fireEvent.click(getByRole("button", { name: /show all \(12\)/i }));
  getByText("Comp 11");
  cleanup();
});
