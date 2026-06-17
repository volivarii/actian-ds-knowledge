import { test } from "node:test";
import assert from "node:assert/strict";
import { graphNodes, graphEdges } from "../../src/substrate/taxonomyAssets";

test("taxonomyAssets exposes the baked graph nodes and edges", () => {
  assert.ok(Array.isArray(graphNodes) && graphNodes.length > 0);
  assert.ok(Array.isArray(graphEdges) && graphEdges.length > 0);
});

test("graphEdges carry source/target/type", () => {
  const e = graphEdges[0];
  assert.ok(e !== undefined, "graphEdges[0] should exist");
  assert.equal(typeof e.source, "string");
  assert.equal(typeof e.target, "string");
  assert.equal(typeof e.type, "string");
});

test("the known category:action a11y_ref edge is present", () => {
  assert.ok(
    graphEdges.some(
      (e) =>
        e.source === "category:action" &&
        e.target === "a11y:alerts-toasts-banners" &&
        e.type === "a11y_ref",
    ),
  );
});
