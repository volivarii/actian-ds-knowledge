import { test } from "node:test";
import assert from "node:assert/strict";
import {
  metricsByDimension,
  topHubs,
  orphanRows,
  type QualityMetric,
} from "../../src/substrate/graphHealth";
import { buildGraphIndex } from "../../src/substrate/graphIndex";
import type { GraphSubset } from "../../src/substrate/graphEligibility";

const report: QualityMetric[] = [
  { dimension: "coverage", metric: "a11y_ref", value: 0.8, timestamp: null, severity: "warning" },
  { dimension: "connectivity", metric: "orphan_nodes", value: 3, timestamp: null, severity: "info" },
];

const subset: GraphSubset = {
  nodes: [
    { id: "category:action", type: "category", title: "Action" },
    { id: "component:button", type: "component", title: "Button" },
    { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
    { id: "foundation:lonely", type: "foundation_section", title: "Lonely" },
  ],
  edges: [
    { source: "component:button", target: "category:action", type: "in_category" },
    { source: "component:button", target: "a11y:contrast", type: "a11y_ref", note: "AA" },
  ],
};
const index = buildGraphIndex(subset);

test("metricsByDimension filters by dimension", () => {
  const cov = metricsByDimension(report, "coverage");
  assert.equal(cov.length, 1);
  assert.equal(cov[0]!.metric, "a11y_ref");
});

test("topHubs ranks by total degree, id-sorted tiebreak, capped", () => {
  const hubs = topHubs(subset, index, 2);
  assert.equal(hubs[0]!.id, "component:button"); // degree 2 (2 out)
  assert.equal(hubs[0]!.degree, 2);
  assert.equal(hubs.length, 2);
});

test("orphanRows lists degree-0 eligible nodes by title", () => {
  const orphans = orphanRows(subset, index);
  assert.deepEqual(orphans.map((o) => o.id), ["foundation:lonely"]);
});
