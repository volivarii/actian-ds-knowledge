import { test } from "node:test";
import assert from "node:assert/strict";
import { slugOfNodeId } from "../../src/substrate/nodeSlug";

test("slugOfNodeId strips the type prefix (the shared data-ref derivation)", () => {
  assert.equal(slugOfNodeId("component:button"), "button");
  assert.equal(slugOfNodeId("a11y:forms"), "forms");
  assert.equal(slugOfNodeId("pattern:import-wizard"), "import-wizard");
});

test("slugOfNodeId returns the id unchanged when there is no prefix", () => {
  assert.equal(slugOfNodeId("button"), "button");
});
