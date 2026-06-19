import test from "node:test";
import assert from "node:assert/strict";
import { appContextAppUiSchema } from "../../src/uiSchemas/appContextApp";
import { appContextEntityUiSchema } from "../../src/uiSchemas/appContextEntity";
import { appContextPatternUiSchema } from "../../src/uiSchemas/appContextPattern";

test("slug and _schema_version are read-only in every app-context uiSchema", () => {
  for (const ui of [appContextAppUiSchema, appContextEntityUiSchema, appContextPatternUiSchema]) {
    assert.equal((ui.slug as any)["ui:readonly"], true);
    assert.equal((ui._schema_version as any)["ui:readonly"], true);
    const order = ui["ui:order"] as string[];
    assert.equal(order[order.length - 1], "*");
  }
});

test("entity/pattern uiSchemas do not list description (it is the prose body)", () => {
  assert.ok(!("description" in appContextEntityUiSchema) ||
    (appContextEntityUiSchema["ui:order"] as string[]).indexOf("description") === -1);
  assert.ok((appContextPatternUiSchema["ui:order"] as string[]).indexOf("description") === -1);
});
