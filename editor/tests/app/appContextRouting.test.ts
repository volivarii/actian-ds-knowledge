import test from "node:test";
import assert from "node:assert/strict";
import {
  isAppContextFile,
  appContextKindConfig,
} from "../../src/app/EditorShell";

test("isAppContextFile matches only the three per-record kinds", () => {
  assert.equal(isAppContextFile("app-context/src/apps/studio.md"), true);
  assert.equal(
    isAppContextFile("app-context/src/entities/data-product.md"),
    true,
  );
  assert.equal(
    isAppContextFile("app-context/src/patterns/import-wizard.md"),
    true,
  );
  assert.equal(isAppContextFile("app-context/src/terminology.yml"), false);
  assert.equal(isAppContextFile("app-context/dist/app-context.json"), false);
});

test("appContextKindConfig selects schema/uiSchema/bodyless per kind", () => {
  assert.deepEqual(
    {
      ...appContextKindConfig("app-context/src/apps/studio.md"),
      uiSchema: undefined,
    },
    {
      schemaKey: "app-context-app",
      bodyless: false,
      uiSchema: undefined,
      flowAtDepth: null,
    },
  );
  const ent = appContextKindConfig("app-context/src/entities/x.md");
  assert.equal(ent?.schemaKey, "app-context-entity");
  assert.equal(ent?.bodyless, false);
  assert.equal(ent?.flowAtDepth, 2);
  const pat = appContextKindConfig("app-context/src/patterns/x.md");
  assert.equal(pat?.schemaKey, "app-context-pattern");
  assert.equal(pat?.bodyless, false);
  assert.equal(pat?.flowAtDepth, 2);
  assert.equal(appContextKindConfig("app-context/dist/app-context.json"), null);
});
