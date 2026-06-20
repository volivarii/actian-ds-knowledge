import type { UiSchema } from "@rjsf/utils";

// Apps author purpose/users/signals in the markdown body (Phase 1). The
// frontmatter form is core-only: label, header, sidebar (+ readonly slug/version).
export const appContextAppUiSchema: UiSchema = {
  "ui:order": ["label", "header", "sidebar", "slug", "_schema_version", "*"],
  _schema_version: { "ui:readonly": true },
  slug: { "ui:title": "Slug", "ui:readonly": true },
  label: { "ui:title": "App label" },
};
