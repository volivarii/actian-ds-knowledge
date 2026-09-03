import type { UiSchema } from "@rjsf/utils";

// Apps author purpose/users/signals in the markdown body (Phase 1). The
// frontmatter form is core-only: label, header, sidebar (+ readonly slug/version).
export const appContextAppUiSchema: UiSchema = {
  "ui:order": ["label", "header", "sidebar", "slug", "_schema_version", "*"],
  "ui:options": {
    groups: [
      {
        title: "Product settings",
        fields: ["header", "sidebar", "slug", "_schema_version"],
        collapsed: true,
        note: "Structured settings — header variant and sidebar navigation. The product's description lives in the markdown body below.",
      },
    ],
  },
  _schema_version: { "ui:readonly": true },
  slug: { "ui:title": "Slug", "ui:readonly": true },
  label: { "ui:title": "Product label" },
  useCases: {
    "ui:options": { addLabel: "use case" },
    items: {
      audience: { "ui:options": { addLabel: "audience" } },
      jobs: { "ui:options": { addLabel: "job" } },
      patterns: { "ui:options": { addLabel: "pattern" } },
    },
  },
  sidebar: { "ui:options": { addLabel: "nav item" } },
};
