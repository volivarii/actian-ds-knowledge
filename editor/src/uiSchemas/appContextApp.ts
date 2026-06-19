import type { UiSchema } from "@rjsf/utils";

// App records are frontmatter-only (no prose body); the screen renders this
// with `bodyless`. Nested header/sidebar use default RJSF inputs.
export const appContextAppUiSchema: UiSchema = {
  "ui:order": ["label", "purpose", "users", "header", "sidebar", "signals", "slug", "_schema_version", "*"],
  _schema_version: { "ui:readonly": true },
  slug: { "ui:title": "Slug", "ui:readonly": true },
  label: { "ui:title": "App label" },
  purpose: { "ui:title": "Purpose", "ui:widget": "textarea" },
  signals: { "ui:title": "Routing signals" },
};
