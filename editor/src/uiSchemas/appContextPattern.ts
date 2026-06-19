import type { UiSchema } from "@rjsf/utils";

// `description` is the markdown body, not a form field.
export const appContextPatternUiSchema: UiSchema = {
  "ui:order": ["label", "apps", "slug", "_schema_version", "*"],
  _schema_version: { "ui:readonly": true },
  slug: { "ui:title": "Slug", "ui:readonly": true },
  label: { "ui:title": "Pattern label" },
  apps: { "ui:title": "Appears in apps" },
};
