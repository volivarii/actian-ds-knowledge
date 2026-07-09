import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";

test("app-context app routes to app-context-app, block style", () => {
  const m = matchFrontmatterForm("app-context/src/apps/studio.md");
  assert.equal(m?.schemaKey, "app-context-app");
  assert.equal(m?.flowAtDepth, null);
});

test("app-context entity routes with flow depth 2", () => {
  const m = matchFrontmatterForm("app-context/src/entities/data-product.md");
  assert.equal(m?.schemaKey, "app-context-entity");
  assert.equal(m?.flowAtDepth, 2);
});

test("category file routes to category-defaults", () => {
  const m = matchFrontmatterForm("components/src/categories/inputs.md");
  assert.equal(m?.schemaKey, "category-defaults");
});

test("words-to-avoid routes to content schema with its own uiSchema", () => {
  const m = matchFrontmatterForm("content/src/writing/words-to-avoid.md");
  assert.equal(m?.schemaKey, "content");
  // its uiSchema shows the wordsToAvoid grid (distinct from the generic content form)
  assert.ok(m?.uiSchema.wordsToAvoid);
});

test("a component body file does NOT match (routes elsewhere)", () => {
  assert.equal(matchFrontmatterForm("components/src/button/usage.md"), null);
});

test("app-context dist json does NOT match", () => {
  assert.equal(matchFrontmatterForm("app-context/dist/app-context.json"), null);
});
