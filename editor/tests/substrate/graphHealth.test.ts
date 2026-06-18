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
  {
    dimension: "coverage",
    metric: "a11y_ref",
    value: 0.8,
    timestamp: null,
    severity: "warning",
  },
  {
    dimension: "connectivity",
    metric: "orphan_nodes",
    value: 3,
    timestamp: null,
    severity: "info",
  },
];

const subset: GraphSubset = {
  nodes: [
    { id: "category:action", type: "category", title: "Action" },
    { id: "component:button", type: "component", title: "Button" },
    { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
    { id: "foundation:lonely", type: "foundation_section", title: "Lonely" },
  ],
  edges: [
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
  assert.deepEqual(
    orphans.map((o) => o.id),
    ["foundation:lonely"],
  );
});

// P6(a): topHubs id-ascending tiebreak when two nodes share the same degree
test("topHubs breaks degree ties by id ascending", () => {
  const tieSubset: GraphSubset = {
    nodes: [
      { id: "component:zwidget", type: "component", title: "Z Widget" },
      { id: "component:awidget", type: "component", title: "A Widget" },
      { id: "category:x", type: "category", title: "X" },
      { id: "category:y", type: "category", title: "Y" },
    ],
    edges: [
      {
        source: "component:awidget",
        target: "category:x",
        type: "in_category",
      },
      {
        source: "component:zwidget",
        target: "category:y",
        type: "in_category",
      },
    ],
  };
  const tieIndex = buildGraphIndex(tieSubset);
  const hubs = topHubs(tieSubset, tieIndex, 4);
  // awidget and zwidget both have degree 1; awidget sorts first (id ascending)
  const ids = hubs.map((h) => h.id);
  const aPos = ids.indexOf("component:awidget");
  const zPos = ids.indexOf("component:zwidget");
  assert.ok(aPos !== -1 && zPos !== -1, "both nodes should appear in hubs");
  assert.ok(
    aPos < zPos,
    `id-ascending tiebreak: 'component:awidget' (pos ${aPos}) should precede 'component:zwidget' (pos ${zPos})`,
  );
});

// P6(b): orphanRows returns multiple orphans sorted by title ascending
test("orphanRows returns multiple orphans sorted by title ascending", () => {
  const multiOrphanSubset: GraphSubset = {
    nodes: [
      { id: "component:button", type: "component", title: "Button" },
      { id: "foundation:zebra", type: "foundation_section", title: "Zebra" },
      { id: "foundation:alpha", type: "foundation_section", title: "Alpha" },
      { id: "foundation:middle", type: "foundation_section", title: "Middle" },
    ],
    edges: [
      {
        source: "component:button",
        target: "foundation:alpha",
        type: "foundations_ref",
      },
    ],
  };
  const multiOrphanIndex = buildGraphIndex(multiOrphanSubset);
  const orphans = orphanRows(multiOrphanSubset, multiOrphanIndex);
  // zebra and middle are orphans; alpha is connected
  assert.equal(orphans.length, 2);
  assert.equal(orphans[0]!.title, "Middle");
  assert.equal(orphans[1]!.title, "Zebra");
});
