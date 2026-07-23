// Turns the flat, edge-type-badged graph neighbours into human-labelled groups
// ("Appears in", "Used in patterns", "Contains", ...) so the relations rail
// speaks author vocabulary, never the internal edge keys (composed_of,
// uses_component, in_category, a11y_ref).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  relationGroupLabel,
  groupGraphNeighbors,
} from "../../src/lib/relationGroups";
import type { Neighbor } from "../../src/substrate/graphIndex";

function neighbor(
  id: string,
  type: string,
  edgeType: string,
  direction: "in" | "out",
): Neighbor {
  return {
    id,
    node: { id, type, title: id.split(":")[1] ?? id },
    edgeType,
    note: null,
    direction,
  };
}

test("relationGroupLabel translates edge type + direction into author vocabulary", () => {
  assert.equal(relationGroupLabel("in_category", "out"), "Category");
  assert.equal(relationGroupLabel("composed_of", "out"), "Contains");
  assert.equal(relationGroupLabel("composed_of", "in"), "Appears in");
  assert.equal(relationGroupLabel("uses_component", "in"), "Used in patterns");
  assert.equal(
    relationGroupLabel("a11y_ref", "out"),
    "Meets accessibility criterion",
  );
  assert.equal(relationGroupLabel("foundations_ref", "out"), "Built on foundations");
  assert.equal(relationGroupLabel("related", "out"), "Related");
  assert.equal(relationGroupLabel("narrower", "in"), "Broader topic");
});

test("an unknown edge type degrades to a plain human label, never a snake_case key", () => {
  const label = relationGroupLabel("mystery_edge", "out");
  assert.ok(!label.includes("_"), `label leaked a key: ${label}`);
});

test("groupGraphNeighbors buckets neighbours under their human relationship", () => {
  const neighbors: Neighbor[] = [
    neighbor("category:action", "category", "in_category", "out"),
    neighbor("component:modal", "component", "composed_of", "in"),
    neighbor("component:page-header", "component", "composed_of", "in"),
    neighbor("pattern:import-wizard", "ux_pattern", "uses_component", "in"),
    neighbor("a11y:buttons", "a11y_criterion", "a11y_ref", "out"),
    neighbor("component:spinner", "component", "composed_of", "out"),
  ];
  const groups = groupGraphNeighbors(neighbors);
  const byLabel = new Map(groups.map((g) => [g.label, g.items]));

  assert.deepEqual(
    [...byLabel.get("Appears in")!].map((n) => n.node!.title),
    ["modal", "page-header"],
    "both composed_of-in neighbours land under Appears in, in order",
  );
  assert.equal(byLabel.get("Used in patterns")!.length, 1);
  assert.equal(byLabel.get("Contains")!.length, 1);
  assert.equal(byLabel.get("Category")!.length, 1);
  assert.equal(byLabel.get("Meets accessibility criterion")!.length, 1);
});

test("group labels never contain internal edge-type keys", () => {
  const neighbors: Neighbor[] = [
    neighbor("category:action", "category", "in_category", "out"),
    neighbor("component:modal", "component", "composed_of", "in"),
    neighbor("pattern:x", "ux_pattern", "uses_component", "in"),
  ];
  for (const g of groupGraphNeighbors(neighbors)) {
    for (const banned of ["in_category", "composed_of", "uses_component", "_"]) {
      assert.ok(
        !g.label.includes(banned),
        `group label "${g.label}" leaked "${banned}"`,
      );
    }
  }
});

test("groups are ordered by author priority: the component's own facets before incoming crowds", () => {
  const neighbors: Neighbor[] = [
    neighbor("component:modal", "component", "composed_of", "in"), // Appears in
    neighbor("category:action", "category", "in_category", "out"), // Category
    neighbor("component:spinner", "component", "composed_of", "out"), // Contains
  ];
  const labels = groupGraphNeighbors(neighbors).map((g) => g.label);
  // Category and Contains (what this component *is* / *has*) sort ahead of the
  // large "Appears in" incoming crowd.
  assert.ok(
    labels.indexOf("Category") < labels.indexOf("Appears in"),
    `Category should precede Appears in, got ${labels.join(", ")}`,
  );
  assert.ok(
    labels.indexOf("Contains") < labels.indexOf("Appears in"),
    `Contains should precede Appears in, got ${labels.join(", ")}`,
  );
});

// Author language, and the two questions kept apart: what am I part of, and
// what do I need. They are different edges and they read as different groups.
test("application-context edges read as author-facing groups", () => {
  // Only the edges this slice makes reachable are relabelled; uses_component:in
  // already ships on component screens and keeps its wording.
  assert.equal(relationGroupLabel("in_app", "out"), "Part of these products");
  assert.equal(relationGroupLabel("in_app", "in"), "In this product");
  assert.equal(
    relationGroupLabel("uses_component", "out"),
    "Built from these components",
  );
});
