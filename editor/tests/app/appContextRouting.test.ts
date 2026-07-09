import test from "node:test";
import assert from "node:assert/strict";
import { isAppContextFile } from "../../src/app/EditorShell";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";

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

test("matchFrontmatterForm selects schema/bodyless/flowAtDepth per app-context kind", () => {
  const app = matchFrontmatterForm("app-context/src/apps/studio.md");
  assert.equal(app?.schemaKey, "app-context-app");
  assert.equal(app?.bodyless, false);
  assert.equal(app?.flowAtDepth, null);
  const ent = matchFrontmatterForm("app-context/src/entities/x.md");
  assert.equal(ent?.schemaKey, "app-context-entity");
  assert.equal(ent?.bodyless, false);
  assert.equal(ent?.flowAtDepth, 2);
  const pat = matchFrontmatterForm("app-context/src/patterns/x.md");
  assert.equal(pat?.schemaKey, "app-context-pattern");
  assert.equal(pat?.bodyless, false);
  assert.equal(pat?.flowAtDepth, 2);
  assert.equal(matchFrontmatterForm("app-context/dist/app-context.json"), null);
});
