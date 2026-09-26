import { test } from "node:test";
import assert from "node:assert/strict";
import { navTargetForNodeId } from "../../src/substrate/navTargetForNodeId";
import { candidateNodeIdForFile } from "../../src/substrate/nodeIdForFile";

test("component → its Authoring Workspace (not a raw file path)", () => {
  assert.equal(navTargetForNodeId("component:button"), "workspace/button");
});

test("category / a11y / foundation → their src markdown files", () => {
  assert.equal(
    navTargetForNodeId("category:data-display"),
    "components/src/categories/data-display.md",
  );
  assert.equal(navTargetForNodeId("a11y:forms"), "accessibility/src/forms.md");
  assert.equal(
    navTargetForNodeId("foundation:tokens"),
    "foundations/src/tokens.md",
  );
});

test("content (group dir unrecoverable) and motion (no editable file) → null", () => {
  assert.equal(navTargetForNodeId("content:loading"), null);
  assert.equal(navTargetForNodeId("motion:fade"), null);
});

test("malformed ids → null (no colon, empty slug, unknown prefix)", () => {
  assert.equal(navTargetForNodeId("button"), null);
  assert.equal(navTargetForNodeId("component:"), null);
  assert.equal(navTargetForNodeId("widget:foo"), null);
  assert.equal(navTargetForNodeId(""), null);
});

test("round-trips with candidateNodeIdForFile for file-backed prefixes", () => {
  for (const id of [
    "category:data-display",
    "a11y:forms",
    "foundation:tokens",
  ]) {
    const target = navTargetForNodeId(id)!;
    assert.equal(candidateNodeIdForFile(target), id);
  }
});

test("navTargetForNodeId resolves app-context nodes to their src files", () => {
  assert.equal(
    navTargetForNodeId("app:studio"),
    "app-context/src/apps/studio.md",
  );
  assert.equal(
    navTargetForNodeId("entity:dataset"),
    "app-context/src/entities/dataset.md",
  );
  assert.equal(
    navTargetForNodeId("pattern:import-wizard"),
    "app-context/src/patterns/import-wizard.md",
  );
  assert.equal(
    navTargetForNodeId("persona:data-steward"),
    "app-context/src/personas/data-steward.md",
  );
});

test("navTargetForNodeId keeps existing mappings (component -> workspace, content -> null)", () => {
  assert.equal(navTargetForNodeId("component:button"), "workspace/button");
  assert.equal(
    navTargetForNodeId("foundation:color-primitives"),
    "foundations/src/color-primitives.md",
  );
  assert.equal(
    navTargetForNodeId("a11y:principles"),
    "accessibility/src/principles.md",
  );
  assert.equal(navTargetForNodeId("content:forms"), null);
});
