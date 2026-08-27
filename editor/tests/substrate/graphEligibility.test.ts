// tests/substrate/graphEligibility.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  EXCLUDED_CATEGORY_SLUGS,
  COMPONENT_SECTION,
  isRegistryComponent,
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

test("the graph rule stays label-based, because graph nodes carry no section", () => {
  assert.ok(EXCLUDED_CATEGORY_SLUGS.has("icons"));
});

test("isRegistryComponent reads the section, not the category", () => {
  assert.equal(isRegistryComponent({ section: COMPONENT_SECTION }), true);
  assert.equal(isRegistryComponent({ section: "Foundations" }), false);
  assert.equal(isRegistryComponent({ section: "Brand Assets" }), false);
  assert.equal(isRegistryComponent({ section: "Other Resources" }), false);
  // An entry with no section is not a component. The predecessor defaulted a
  // missing category to "uncategorized" and excluded that, so this preserves the
  // one thing the old rule got right.
  assert.equal(isRegistryComponent({}), false);
  assert.equal(isRegistryComponent(undefined), false);
  assert.equal(isRegistryComponent(null), false);
});

// Against the real registry, not a fixture. The rule this replaced passed every
// unit test it had while letting 95 non-components into the Coverage dashboard,
// because the defect was never in the predicate: it was in the list the
// predicate consulted going stale against data nobody re-read.
test("no non-component section reaches the eligible set, on the shipped registry", () => {
  const registryPath = path.join(
    import.meta.dirname,
    "../../../components/dist/registries/dskit.json",
  );
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as {
    components?: Record<string, { section?: string; category?: string }>;
  };
  const entries = Object.entries(registry.components ?? {});
  assert.ok(entries.length > 0, "the registry must not be empty");

  const eligible = entries.filter(([, e]) => isRegistryComponent(e));
  const leaked = eligible.filter(([, e]) => e.section !== COMPONENT_SECTION);
  assert.deepEqual(leaked, [], "only the Components section may be eligible");

  // Every entry carries a section, which is what makes the rule total. If Figma
  // ever ships one without, this fails rather than silently excluding it.
  const sectionless = entries.filter(([slug]) => !registry.components![slug].section);
  assert.deepEqual(
    sectionless.map(([slug]) => slug),
    [],
    "every registry entry must carry a section",
  );

  // The two families that leaked, named so the regression cannot return quietly.
  const byCategory = (label: string) =>
    eligible.filter(([, e]) => e.category === label).map(([slug]) => slug);
  assert.deepEqual(byCategory("Third-party logos"), []);
  assert.deepEqual(byCategory("Breakpoint, grid & structure"), []);
  assert.deepEqual(byCategory("Icons"), []);

  // And the set is not vacuously empty: real components still qualify.
  const slugs = new Set(eligible.map(([slug]) => slug));
  ["button", "table", "modal"].forEach((slug) =>
    assert.ok(slugs.has(slug), `${slug} must stay eligible`),
  );
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
