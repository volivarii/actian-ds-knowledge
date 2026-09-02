import type { UiSchema } from "@rjsf/utils";

// `description` is the markdown body, not a form field.
export const appContextPatternUiSchema: UiSchema = {
  "ui:order": ["label", "apps", "slug", "_schema_version", "*"],
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
  label: { "ui:title": "Pattern label" },
  // `apps` is the in_app edge seen from this record: it says which Products
  // this Pattern belongs to. "Part of" is the nomenclature's word for that
  // side, and it is the same word the relations rail uses.
  apps: { "ui:title": "Part of", "ui:options": { addLabel: "product" } },
};
