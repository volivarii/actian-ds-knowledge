import { test } from "node:test";
import assert from "node:assert/strict";
import { appContextPatternUiSchema } from "../../src/uiSchemas/appContextPattern";
import { appContextEntityUiSchema } from "../../src/uiSchemas/appContextEntity";
import { appContextPersonaUiSchema } from "../../src/uiSchemas/appContextPersona";
import { categoryDefaultsUiSchema } from "../../src/uiSchemas/categoryDefaults";
import { contentUiSchema } from "../../src/uiSchemas/content";
import { guidelineMetaUiSchema } from "../../src/uiSchemas/guidelineMeta";
import { OWNED } from "../../src/lib/connections/owned";

const hidden = (s: Record<string, any>, k: string) => s?.[k]?.["ui:field"] === "Hidden";

test("links are edited in Connections only, so the forms hide those fields", () => {
  for (const k of ["apps", "components"]) assert.ok(hidden(appContextPatternUiSchema, k), `pattern ${k}`);
  for (const k of ["apps", "patterns", "relationships"]) assert.ok(hidden(appContextEntityUiSchema, k), `entity ${k}`);
  assert.ok(hidden(appContextPersonaUiSchema, "apps"), "persona apps");
  for (const k of ["a11y_refs", "foundations_refs", "motion_refs"]) {
    assert.ok(hidden(categoryDefaultsUiSchema, k), `category ${k}`);
    assert.ok(hidden(guidelineMetaUiSchema, k), `_meta.yml ${k}`);
  }
  assert.ok(hidden(contentUiSchema, "relatedComponents"), "content relatedComponents");
});

test("every field Connections writes is hidden in its record's form", () => {
  const forms: Record<string, Record<string, any>> = {
    pattern: appContextPatternUiSchema,
    entity: appContextEntityUiSchema,
    persona: appContextPersonaUiSchema,
    category: categoryDefaultsUiSchema,
    component: guidelineMetaUiSchema,
    content: contentUiSchema,
  };
  for (const [kind, fields] of Object.entries(OWNED))
    for (const f of fields!) assert.ok(hidden(forms[kind]!, f.field[0]!), `${kind}: ${f.field[0]} still in the form`);
});
