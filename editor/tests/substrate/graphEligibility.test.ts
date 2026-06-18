// tests/substrate/graphEligibility.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXCLUDED_CATEGORY_SLUGS,
  EXCLUDED_CATEGORY_LABELS,
  excludedNodeIds,
  eligibleSubset,
} from "../../src/substrate/graphEligibility";
import type {
  GraphNodeRaw,
  GraphEdgeRaw,
} from "../../src/substrate/taxonomyAssets";

const nodes: GraphNodeRaw[] = [
  { id: "category:icons", type: "category", title: "Icons" },
  { id: "category:action", type: "category", title: "Action" },
  { id: "component:close-icon", type: "component", title: "Close icon" },
  { id: "component:button", type: "component", title: "Button" },
  { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
];
const edges: GraphEdgeRaw[] = [
  {
    source: "component:close-icon",
    target: "category:icons",
    type: "in_category",
  },
  {
    source: "component:button",
    target: "category:action",
    type: "in_category",
  },
  {
    source: "component:button",
    target: "a11y:contrast",
    type: "a11y_ref",
    note: "AA",
  },
];

test("policy sets carry both representations of the same exclusion", () => {
  assert.ok(EXCLUDED_CATEGORY_SLUGS.has("icons"));
  assert.ok(EXCLUDED_CATEGORY_LABELS.has("Icons"));
  assert.ok(EXCLUDED_CATEGORY_LABELS.has("uncategorized"));
});

test("excludedNodeIds drops the asset category AND its in_category members", () => {
  const drop = excludedNodeIds(nodes, edges);
  assert.ok(drop.has("category:icons"));
  assert.ok(drop.has("component:close-icon"));
  assert.ok(!drop.has("component:button"));
  assert.ok(!drop.has("category:action"));
});

test("eligibleSubset removes asset nodes and any edge touching them", () => {
  const sub = eligibleSubset(nodes, edges);
  assert.deepEqual(sub.nodes.map((n) => n.id).sort(), [
    "a11y:contrast",
    "category:action",
    "component:button",
  ]);
  assert.equal(sub.edges.length, 2); // the close-icon in_category edge is gone
  assert.ok(sub.edges.every((e) => e.source !== "component:close-icon"));
});

// ── Degree-0 component exclusion (Rule 2) ────────────────────────────────────

test("degree-0 component node is in excludedNodeIds and absent from eligibleSubset", () => {
  // `component:academic-cap` has NO edges at all — it's an unwired asset node.
  const localNodes: GraphNodeRaw[] = [
    { id: "category:action", type: "category", title: "Action" },
    { id: "component:button", type: "component", title: "Button" },
    { id: "component:academic-cap", type: "component", title: "Academic cap" }, // degree-0
    { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
  ];
  const localEdges: GraphEdgeRaw[] = [
    {
      source: "component:button",
      target: "category:action",
      type: "in_category",
    },
    {
      source: "component:button",
      target: "a11y:contrast",
      type: "a11y_ref",
      note: "AA",
    },
  ];
  const drop = excludedNodeIds(localNodes, localEdges);
  assert.ok(
    drop.has("component:academic-cap"),
    "degree-0 component must be excluded",
  );

  const sub = eligibleSubset(localNodes, localEdges);
  const ids = sub.nodes.map((n) => n.id);
  assert.ok(
    !ids.includes("component:academic-cap"),
    "degree-0 component absent from eligibleSubset",
  );
});

test("component node WITH at least one edge (but no in_category) is kept", () => {
  // `component:modal` is wired via a11y_ref but NOT in any excluded category.
  // It must NOT be dropped by the degree-0 rule.
  const localNodes: GraphNodeRaw[] = [
    { id: "component:modal", type: "component", title: "Modal" },
    { id: "a11y:focus-trap", type: "a11y_criterion", title: "Focus trap" },
  ];
  const localEdges: GraphEdgeRaw[] = [
    {
      source: "component:modal",
      target: "a11y:focus-trap",
      type: "a11y_ref",
      note: "AA",
    },
  ];
  const drop = excludedNodeIds(localNodes, localEdges);
  assert.ok(
    !drop.has("component:modal"),
    "wired component (no category) must not be excluded",
  );

  const sub = eligibleSubset(localNodes, localEdges);
  const ids = sub.nodes.map((n) => n.id);
  assert.ok(
    ids.includes("component:modal"),
    "wired component present in eligibleSubset",
  );
});

test("non-component degree-0 nodes (e.g. orphan a11y_criterion) are NOT excluded", () => {
  // An a11y_criterion with no edges is a meaningful orphan — surfaced by the
  // Relationships tab so the author can fix it. It must NOT be caught by Rule 2.
  const localNodes: GraphNodeRaw[] = [
    {
      id: "a11y:orphan-criterion",
      type: "a11y_criterion",
      title: "Orphan criterion",
    },
    { id: "component:button", type: "component", title: "Button" },
    { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
  ];
  const localEdges: GraphEdgeRaw[] = [
    {
      source: "component:button",
      target: "a11y:contrast",
      type: "a11y_ref",
      note: "AA",
    },
  ];
  const drop = excludedNodeIds(localNodes, localEdges);
  assert.ok(
    !drop.has("a11y:orphan-criterion"),
    "orphan a11y_criterion must remain in the graph",
  );

  const sub = eligibleSubset(localNodes, localEdges);
  const ids = sub.nodes.map((n) => n.id);
  assert.ok(
    ids.includes("a11y:orphan-criterion"),
    "orphan a11y_criterion present in eligibleSubset",
  );
});
