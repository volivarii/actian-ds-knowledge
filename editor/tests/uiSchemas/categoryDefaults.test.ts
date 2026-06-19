import test from "node:test";
import assert from "node:assert/strict";
import { categoryDefaultsUiSchema as ui } from "../../src/uiSchemas/categoryDefaults";

test("wires each refs field to RefArray with the right domain", () => {
  assert.equal((ui.a11y_refs as any)["ui:widget"], "RefArray");
  assert.equal((ui.a11y_refs as any)["ui:options"].refDomain, "accessibility");
  assert.equal((ui.motion_refs as any)["ui:options"].refDomain, "motion");
  assert.equal((ui.foundations_refs as any)["ui:options"].refDomain, "foundations");
});

test("slug and _schema_version are read-only", () => {
  assert.equal((ui.slug as any)["ui:readonly"], true);
  assert.equal((ui._schema_version as any)["ui:readonly"], true);
});

test("ui:order ends with the wildcard", () => {
  const order = ui["ui:order"] as string[];
  assert.equal(order[order.length - 1], "*");
});
