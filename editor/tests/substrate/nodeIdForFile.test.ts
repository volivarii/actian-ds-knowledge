import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateNodeIdForFile,
  nodeIdForFile,
} from "../../src/substrate/nodeIdForFile";
import { buildGraphIndex } from "../../src/substrate/graphIndex";

test("candidateNodeIdForFile maps each domain's path convention", () => {
  assert.equal(candidateNodeIdForFile("components/src/categories/action.md"), "category:action");
  assert.equal(candidateNodeIdForFile("components/src/button/_meta.yml"), "component:button");
  assert.equal(candidateNodeIdForFile("components/src/button/design.md"), "component:button");
  assert.equal(candidateNodeIdForFile("accessibility/src/color-contrast.md"), "a11y:color-contrast");
  assert.equal(candidateNodeIdForFile("foundations/src/tokens.md"), "foundation:tokens");
  assert.equal(candidateNodeIdForFile("content/src/patterns/forms.md"), "content:forms");
  assert.equal(candidateNodeIdForFile("README.md"), null);
  assert.equal(candidateNodeIdForFile(""), null);
});

test("nodeIdForFile returns the id only when it resolves to a real node", () => {
  const ix = buildGraphIndex({
    nodes: [{ id: "component:button", type: "component", title: "Button" }],
    edges: [],
  });
  assert.equal(nodeIdForFile("components/src/button/_meta.yml", ix), "component:button");
  assert.equal(nodeIdForFile("components/src/ghost/_meta.yml", ix), null);
  assert.equal(nodeIdForFile(undefined, ix), null);
});
