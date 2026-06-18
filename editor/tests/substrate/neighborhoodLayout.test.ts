import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutNeighborhood } from "../../src/substrate/neighborhoodLayout";
import { buildGraphIndex } from "../../src/substrate/graphIndex";

const index = buildGraphIndex({
  nodes: [
    { id: "component:button", type: "component", title: "Button" },
    { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
    { id: "category:action", type: "category", title: "Action" },
    { id: "foundation:color", type: "foundation_section", title: "Color" }, // depth-2, not shown at depth 1
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
    {
      source: "a11y:contrast",
      target: "foundation:color",
      type: "foundations_ref",
    },
  ],
});

test("focus node is centered and flagged", () => {
  const l = layoutNeighborhood("component:button", index, {
    width: 600,
    height: 400,
  });
  const focus = l.nodes.find((n) => n.id === "component:button")!;
  assert.equal(focus.isFocus, true);
  assert.equal(focus.hop, 0);
  assert.equal(focus.x, 300);
  assert.equal(focus.y, 200);
});

test("depth 1 includes 1-hop neighbors only; coordinates are integer + deterministic", () => {
  const a = layoutNeighborhood("component:button", index, {
    depth: 1,
    width: 600,
    height: 400,
  });
  const b = layoutNeighborhood("component:button", index, {
    depth: 1,
    width: 600,
    height: 400,
  });
  const ids = a.nodes.map((n) => n.id).sort();
  assert.deepEqual(ids, [
    "a11y:contrast",
    "category:action",
    "component:button",
  ]);
  assert.ok(
    a.nodes.every((n) => Number.isInteger(n.x) && Number.isInteger(n.y)),
  );
  assert.deepEqual(a, b); // pure + deterministic
});

test("edges only connect placed nodes and are deduped", () => {
  const l = layoutNeighborhood("component:button", index, {
    depth: 1,
    width: 600,
    height: 400,
  });
  assert.equal(l.edges.length, 2); // the a11y:contrast->foundation edge is out of view
  for (const e of l.edges) {
    assert.ok(l.nodes.some((n) => n.id === e.source));
    assert.ok(l.nodes.some((n) => n.id === e.target));
  }
});

test("edgeTypes filter restricts traversal", () => {
  const l = layoutNeighborhood("component:button", index, {
    depth: 1,
    edgeTypes: ["a11y_ref"],
  });
  assert.deepEqual(l.nodes.map((n) => n.id).sort(), [
    "a11y:contrast",
    "component:button",
  ]);
});

test("depth 2 includes 2-hop neighbors on the outer ring", () => {
  const l = layoutNeighborhood("component:button", index, {
    depth: 2,
    width: 600,
    height: 400,
  });
  const ids = l.nodes.map((n) => n.id).sort();
  assert.ok(ids.includes("foundation:color"));
  const fc = l.nodes.find((n) => n.id === "foundation:color")!;
  assert.equal(fc.hop, 2);
});
