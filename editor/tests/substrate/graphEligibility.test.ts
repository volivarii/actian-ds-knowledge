// tests/substrate/graphEligibility.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXCLUDED_CATEGORY_SLUGS,
  EXCLUDED_CATEGORY_LABELS,
  excludedNodeIds,
  eligibleSubset,
} from "../../src/substrate/graphEligibility";
import type { GraphNodeRaw, GraphEdgeRaw } from "../../src/substrate/taxonomyAssets";

const nodes: GraphNodeRaw[] = [
  { id: "category:icons", type: "category", title: "Icons" },
  { id: "category:action", type: "category", title: "Action" },
  { id: "component:close-icon", type: "component", title: "Close icon" },
  { id: "component:button", type: "component", title: "Button" },
  { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
];
const edges: GraphEdgeRaw[] = [
  { source: "component:close-icon", target: "category:icons", type: "in_category" },
  { source: "component:button", target: "category:action", type: "in_category" },
  { source: "component:button", target: "a11y:contrast", type: "a11y_ref", note: "AA" },
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
  assert.deepEqual(
    sub.nodes.map((n) => n.id).sort(),
    ["a11y:contrast", "category:action", "component:button"],
  );
  assert.equal(sub.edges.length, 2); // the close-icon in_category edge is gone
  assert.ok(sub.edges.every((e) => e.source !== "component:close-icon"));
});
