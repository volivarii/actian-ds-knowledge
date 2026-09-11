import type { UiSchema } from "@rjsf/utils";

// `description` is the markdown body, not a form field.
//
// Every author-facing field carries its own title and help rather than RJSF's
// fallback to the schema prose, which is a machine contract (#646). The three
// optional fields say to stay empty until a source says what goes in them: an
// empty field an author is invited to guess at is how an invented fact gets in.
export const appContextPersonaUiSchema: UiSchema = {
  "ui:order": [
    "label",
    "apps",
    "permissionGroup",
    "literacy",
    "frequency",
    "sources",
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
        note: "Identity and format fields the system maintains: shown for reference, saved unchanged.",
      },
    ],
  },
  _schema_version: { "ui:readonly": true },
  slug: { "ui:title": "Slug", "ui:readonly": true },
  label: {
    "ui:title": "Persona name",
    "ui:description":
      "The name use cases give this role. Their audience must match it exactly.",
  },
  // `apps` is the in_app edge seen from this record, so it takes the same word
  // the entity and pattern forms use.
  apps: {
    "ui:title": "Part of",
    "ui:description":
      "The products this persona works in. Each product's list of users is built from this.",
    "ui:options": { addLabel: "product" },
  },
  permissionGroup: {
    "ui:title": "Permission group",
    "ui:description":
      "The product permission group this persona is given. Leave empty until a source says which.",
  },
  literacy: {
    "ui:title": "Data literacy",
    "ui:description":
      "Technical reads schema and lineage terms unaided; business needs them explained. Leave empty until a source says which.",
  },
  frequency: {
    "ui:title": "How often",
    "ui:description":
      "Daily works in the product as part of the job; occasional comes in for a task. Leave empty until a source says which.",
  },
  sources: {
    "ui:title": "Sources",
    "ui:description":
      "Where this record's facts come from, so a reader can tell research from a definition.",
    "ui:options": { addLabel: "source" },
  },
};
