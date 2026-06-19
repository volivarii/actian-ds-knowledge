import test from "node:test";
import assert from "node:assert/strict";
import { pickSchemaKey } from "../../src/core/validateAgainstSchema";

test("maps app-context src files to their per-kind schema keys", () => {
  assert.equal(pickSchemaKey("app-context/src/apps/studio.md"), "app-context-app");
  assert.equal(pickSchemaKey("app-context/src/entities/data-product.md"), "app-context-entity");
  assert.equal(pickSchemaKey("app-context/src/patterns/import-wizard.md"), "app-context-pattern");
});

test("does not map the dist, terminology, or non-md app-context paths to per-kind keys", () => {
  assert.equal(pickSchemaKey("app-context/dist/app-context.json"), "app-context");
  assert.notEqual(pickSchemaKey("app-context/src/terminology.yml"), "app-context-term");
  assert.equal(pickSchemaKey("app-context/src/apps/studio.txt"), null);
});
