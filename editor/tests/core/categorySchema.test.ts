import test from "node:test";
import assert from "node:assert/strict";
import {
  pickSchemaKey,
  validateAgainstSchema,
} from "../../src/core/validateAgainstSchema";
import { SchemaValidationError } from "../../src/core/types";
import { readFileSync } from "node:fs";

const schema = JSON.parse(
  readFileSync(
    new URL("../../../schemas/category-defaults.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;
const schemas = { "category-defaults": schema };

const VALID = `---
_schema_version: 2
slug: action
label: Action
authoring_status: engineer-seed
confidence: { anatomy: medium, variants: high, motion: high, a11y: high }
last_reviewed: 2026-05-12
anatomy:
  - { name: Container, description: the surface }
  - { name: Label, description: the text }
variants:
  - { axis: Style, values: [primary, secondary] }
motion_refs:
  - { ref: state-transitions }
a11y_refs:
  - { ref: focus-keyboard }
  - { ref: color-contrast }
  - { ref: aria-labels }
---

# Action
prose body
`;

test("pickSchemaKey maps category md to category-defaults", () => {
  assert.equal(
    pickSchemaKey("components/src/categories/action.md"),
    "category-defaults",
  );
  assert.equal(pickSchemaKey("components/src/categories/feedback.md"), "category-defaults");
});

test("valid category frontmatter passes validation", () => {
  assert.doesNotThrow(() =>
    validateAgainstSchema({
      path: "components/src/categories/action.md",
      content: VALID,
      schemas,
    }),
  );
});

test("invalid confidence value is rejected", () => {
  const bad = VALID.replace("anatomy: medium", "anatomy: huge");
  assert.throws(
    () =>
      validateAgainstSchema({
        path: "components/src/categories/action.md",
        content: bad,
        schemas,
      }),
    SchemaValidationError,
  );
});

test("too few a11y_refs is rejected (schema minItems 3)", () => {
  const bad = VALID.replace(
    /a11y_refs:\n(  - \{ ref: [^\n]+\}\n)+/,
    "a11y_refs:\n  - { ref: focus-keyboard }\n",
  );
  assert.throws(
    () =>
      validateAgainstSchema({
        path: "components/src/categories/action.md",
        content: bad,
        schemas,
      }),
    SchemaValidationError,
  );
});
