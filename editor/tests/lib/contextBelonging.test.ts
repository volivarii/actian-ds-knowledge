import { test } from "node:test";
import assert from "node:assert/strict";
import { graphNeighborsForFile } from "../../src/lib/referenceIndex";
import { groupGraphNeighbors } from "../../src/lib/relationGroups";

// Grounded on the real graph: what an author actually sees when they open one
// of these records. Asserts the SHAPE of the answer, not frozen counts, so a
// product shipping new records does not break it.
function labels(path: string): string[] {
  return groupGraphNeighbors(graphNeighborsForFile(path)).map((g) => g.label);
}

test("a product shows what is part of it", () => {
  const groups = groupGraphNeighbors(
    graphNeighborsForFile("app-context/src/apps/studio.md"),
  );
  const parts = groups.find((g) => g.label === "Contains");
  assert.ok(parts, "a product must show its own entities and features");
  assert.ok(parts.items.length > 0);
});

test("an entity shows the products it is part of", () => {
  assert.ok(labels("app-context/src/entities/dataset.md").includes(
    "Part of",
  ));
});

// Belonging and dependency are different questions and must not be one list.
// This is the test that caught in_app being mapped to composition, where a
// Pattern would have read "built from Studio".
test("a pattern separates what it is part of from what it is built from", () => {
  const l = labels("app-context/src/patterns/lineage-graph.md");
  assert.ok(l.includes("Part of"));
  assert.ok(l.includes("Built from"));
});

test("a record that belongs to no product simply has no belonging group", () => {
  assert.deepEqual(labels("app-context/src/entities/not-a-record.md"), []);
});

// The ranking list is keyed by label, so a relabel that forgets it drops these
// groups to the tail among unknown edge types. Pin the order the panel promises.
test("a pattern's own facets rank ahead of the crowds that point at it", () => {
  const order = groupGraphNeighbors(
    graphNeighborsForFile("app-context/src/patterns/lineage-graph.md"),
  ).map((g) => g.label);
  assert.ok(
    order.indexOf("Built from") < order.indexOf("Part of"),
    `expected own facets first, got ${order.join(", ")}`,
  );
});
