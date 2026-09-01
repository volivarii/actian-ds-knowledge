import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";

test("app-context app routes to app-context-app", () => {
  const m = matchFrontmatterForm("app-context/src/apps/studio.md");
  assert.equal(m?.schemaKey, "app-context-app");
});

test("app-context entity routes to app-context-entity", () => {
  const m = matchFrontmatterForm("app-context/src/entities/data-product.md");
  assert.equal(m?.schemaKey, "app-context-entity");
});

test("category file routes to category-defaults", () => {
  const m = matchFrontmatterForm("components/src/categories/inputs.md");
  assert.equal(m?.schemaKey, "category-defaults");
});

test("words-to-avoid routes to content schema with its own uiSchema", () => {
  const m = matchFrontmatterForm("content/src/writing/words-to-avoid.md");
  assert.equal(m?.schemaKey, "content");
  // its uiSchema shows the wordsToAvoid grid (distinct from the generic content form)
  assert.ok(
    (m?.uiSchema.wordsToAvoid as { items?: unknown } | undefined)?.items,
    "words-to-avoid must resolve to the grid uiSchema, not the generic hidden one",
  );
});

test("a component body file does NOT match (routes elsewhere)", () => {
  assert.equal(matchFrontmatterForm("components/src/button/usage.md"), null);
});

test("app-context dist json does NOT match", () => {
  assert.equal(matchFrontmatterForm("app-context/dist/app-context.json"), null);
});

test("app-context records use the YAML surface", () => {
  for (const p of [
    "app-context/src/apps/studio.md",
    "app-context/src/entities/dataset.md",
    "app-context/src/patterns/wizards.md",
  ]) {
    assert.equal(matchFrontmatterForm(p)?.surface, "yaml", p);
  }
});

test("every other domain keeps the form surface in this slice", () => {
  for (const p of [
    "content/src/patterns/forms.md",
    "foundations/src/tokens.md",
    "components/src/categories/action.md",
    "content/src/writing/words-to-avoid.md",
  ]) {
    const cfg = matchFrontmatterForm(p);
    assert.ok(cfg, `${p} should still match a form config`);
    assert.notEqual(cfg!.surface, "yaml", p);
  }
});

test("every record that opens as a form preserves its file's comments", () => {
  // The form is now the default surface for app-context records, and a form
  // save serialises from parsed data. The schema directive on line one of all
  // 64 records is a YAML COMMENT, so without this flag on the registry entry
  // the first save of each record would silently unhook it from its schema.
  // Asserted on the REGISTRY, not on a screen given the prop by hand: the
  // screen honouring `preserveComments` proves nothing about whether anything
  // sets it.
  for (const path of [
    "app-context/src/entities/dataset.md",
    "app-context/src/apps/studio.md",
    "app-context/src/patterns/search-filtered-table.md",
  ]) {
    const form = matchFrontmatterForm(path);
    assert.ok(form, `${path} should route to a form`);
    assert.equal(
      form!.preserveComments,
      true,
      `${path} opens as a form, so its comments must survive a save`,
    );
  }
});
