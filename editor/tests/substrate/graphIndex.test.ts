import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraphIndex,
  bakedGraphIndex,
  type GraphInput,
} from "../../src/substrate/graphIndex";

const fixture: GraphInput = {
  nodes: [
    { id: "component:button", type: "component", title: "Button" },
    { id: "a11y:contrast", type: "a11y_criterion", title: "Contrast" },
    { id: "category:action", type: "category", title: "Action" },
    { id: "content:loading", type: "content_topic", title: "Loading" },
  ],
  edges: [
    {
      source: "component:button",
      target: "a11y:contrast",
      type: "a11y_ref",
      note: "AA contrast",
    },
    {
      source: "component:button",
      target: "category:action",
      type: "in_category",
    },
    { source: "content:loading", target: "component:button", type: "related" },
  ],
};

test("node() resolves a node by id, null when absent", () => {
  const ix = buildGraphIndex(fixture);
  assert.equal(ix.node("component:button")?.title, "Button");
  assert.equal(ix.node("component:nope"), null);
});

test("neighbors() defaults to outgoing", () => {
  const ix = buildGraphIndex(fixture);
  const out = ix.neighbors("component:button");
  assert.deepEqual(out.map((n) => n.id).sort(), [
    "a11y:contrast",
    "category:action",
  ]);
  assert.ok(out.every((n) => n.direction === "out"));
});

test("neighbors() filters by edgeTypes and carries note + resolved node", () => {
  const ix = buildGraphIndex(fixture);
  const a11y = ix.neighbors("component:button", { edgeTypes: ["a11y_ref"] });
  assert.equal(a11y.length, 1);
  assert.equal(a11y[0]?.id, "a11y:contrast");
  assert.equal(a11y[0]?.edgeType, "a11y_ref");
  assert.equal(a11y[0]?.note, "AA contrast");
  assert.equal(a11y[0]?.node?.title, "Contrast");
});

test("referencedBy() returns typed reverse edges (incoming)", () => {
  const ix = buildGraphIndex(fixture);
  const refs = ix.referencedBy("component:button");
  assert.deepEqual(
    refs.map((n) => n.id),
    ["content:loading"],
  );
  assert.equal(refs[0]?.edgeType, "related");
  assert.equal(refs[0]?.direction, "in");
  assert.deepEqual(
    ix.referencedBy("a11y:contrast").map((n) => n.id),
    ["component:button"],
  );
});

test("neighbors(direction:'both') unions out + in", () => {
  const ix = buildGraphIndex(fixture);
  assert.equal(
    ix.neighbors("component:button", { direction: "both" }).length,
    3,
  );
});

test("degIn / degOut / orphans", () => {
  const ix = buildGraphIndex({
    nodes: [
      ...fixture.nodes,
      { id: "foundation:tokens", type: "foundation_section", title: "Tokens" },
    ],
    edges: fixture.edges,
  });
  assert.equal(ix.degOut("component:button"), 2);
  assert.equal(ix.degIn("component:button"), 1);
  assert.equal(ix.degOut("a11y:contrast"), 0);
  assert.equal(ix.degIn("a11y:contrast"), 1);
  assert.ok(ix.orphans().includes("foundation:tokens"));
  assert.ok(!ix.orphans().includes("component:button"));
});

test("bakedGraphIndex(): real substrate — typed forward + reverse over real edges", () => {
  const ix = bakedGraphIndex();
  assert.ok(ix.node("category:action") !== null);
  const a11y = ix.neighbors("category:action", {
    edgeTypes: ["a11y_ref"],
    direction: "out",
  });
  assert.ok(a11y.length > 0);
  assert.ok(
    a11y.every((n) => n.edgeType === "a11y_ref" && n.direction === "out"),
  );
  const back = ix.referencedBy("a11y:alerts-toasts-banners", {
    edgeTypes: ["a11y_ref"],
  });
  assert.ok(back.some((n) => n.id === "category:action"));
});

test("bakedGraphIndex() is memoized (same instance)", () => {
  assert.equal(bakedGraphIndex(), bakedGraphIndex());
});

test("edge to an unknown id resolves node:null (crash-safe under data drift)", () => {
  const ix = buildGraphIndex({
    nodes: [{ id: "component:button", type: "component", title: "Button" }],
    edges: [
      { source: "component:button", target: "a11y:ghost", type: "a11y_ref" },
    ],
  });
  const out = ix.neighbors("component:button");
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "a11y:ghost");
  assert.equal(out[0]?.node, null);
});

test("orphans() returns a defensive copy (mutating it can't corrupt the index)", () => {
  const ix = buildGraphIndex({
    nodes: [
      { id: "foundation:tokens", type: "foundation_section", title: "Tokens" },
    ],
    edges: [],
  });
  const first = ix.orphans();
  first.push("component:injected");
  assert.deepEqual(ix.orphans(), ["foundation:tokens"]);
});
