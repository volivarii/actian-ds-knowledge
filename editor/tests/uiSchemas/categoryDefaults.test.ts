import test from "node:test";
import assert from "node:assert/strict";
import { categoryDefaultsUiSchema as ui } from "../../src/uiSchemas/categoryDefaults";

test("wires each refs field to RefArray with the right domain", () => {
  assert.equal((ui.a11y_refs as any)["ui:widget"], "RefArray");
  assert.equal((ui.a11y_refs as any)["ui:options"].refDomain, "accessibility");
  assert.equal((ui.motion_refs as any)["ui:options"].refDomain, "motion");
  assert.equal(
    (ui.foundations_refs as any)["ui:options"].refDomain,
    "foundations",
  );
});

test("slug and _schema_version are read-only", () => {
  assert.equal((ui.slug as any)["ui:readonly"], true);
  assert.equal((ui._schema_version as any)["ui:readonly"], true);
});

test("ui:order ends with the wildcard", () => {
  const order = ui["ui:order"] as string[];
  assert.equal(order[order.length - 1], "*");
});

test("Figma-sourced fields are disabled (greyed-out, non-editable)", () => {
  assert.equal((ui.anatomy as any)["ui:disabled"], true);
  assert.equal((ui.variants as any)["ui:disabled"], true);
  assert.equal((ui.confidence as any)["ui:disabled"], true);
});

test("disabled arrays disable add/remove/reorder", () => {
  for (const field of ["anatomy", "variants"]) {
    const opts = (ui[field] as any)["ui:options"];
    assert.equal(opts.addable, false, `${field} not addable`);
    assert.equal(opts.removable, false, `${field} not removable`);
    assert.equal(opts.orderable, false, `${field} not orderable`);
  }
});

test("root options group the Figma-sourced fields under a synced section", () => {
  const opts = (ui as any)["ui:options"];
  const group = opts.groups[0];
  assert.deepEqual(group.fields, ["anatomy", "variants", "confidence"]);
  assert.equal(group.title, "Synced from Figma");
  assert.equal(group.collapsed, true);
  assert.equal(typeof group.note, "string");
});

test("editable fields lead the order; synced fields trail", () => {
  const order = ui["ui:order"] as string[];
  // refs (editable) come before anatomy/variants/confidence (synced)
  assert.ok(order.indexOf("a11y_refs") < order.indexOf("anatomy"));
  assert.ok(order.indexOf("foundations_refs") < order.indexOf("confidence"));
});
