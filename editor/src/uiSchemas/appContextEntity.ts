import type { UiSchema } from "@rjsf/utils";

// `description` is the markdown body, not a form field. `relationships` uses a
// custom field (both halves picked from a list, F8); `apps` still uses the
// default input.
export const appContextEntityUiSchema: UiSchema = {
  "ui:order": [
    "label",
    "properties",
    "relationships",
    "apps",
    "slug",
    "_schema_version",
    "*",
  ],
  "ui:options": {
    groups: [
      {
        title: "Managed by the system",
        fields: ["slug", "_schema_version"],
        collapsed: true,
        note: "Identity and format fields the system maintains — shown for reference, saved unchanged.",
      },
    ],
  },
  _schema_version: { "ui:readonly": true },
  slug: { "ui:title": "Slug", "ui:readonly": true },
  label: { "ui:title": "Entity label" },
  properties: {
    "ui:title": "Properties",
    "ui:options": { addLabel: "property" },
  },
  relationships: { "ui:field": "Relationships" },
  // Same field, same edge, same word as the Pattern form. These read
  // "Appears in apps" and "Surfaced in apps" — two labels for one thing.
  apps: { "ui:title": "Part of", "ui:options": { addLabel: "product" } },
};
