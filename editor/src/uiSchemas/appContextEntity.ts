import type { UiSchema } from "@rjsf/utils";

// `description` is the markdown body, not a form field. relationships/apps use
// default RJSF inputs (ref-pickers are a Phase-1 enrichment).
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
  _schema_version: { "ui:readonly": true },
  slug: { "ui:title": "Slug", "ui:readonly": true },
  label: { "ui:title": "Entity label" },
  properties: {
    "ui:title": "Properties",
    "ui:options": { addLabel: "property" },
  },
  relationships: { "ui:title": "Relationships (verb → entity slug)" },
  apps: { "ui:title": "Surfaced in apps", "ui:options": { addLabel: "app" } },
};
