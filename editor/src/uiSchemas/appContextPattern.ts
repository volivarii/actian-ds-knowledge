import type { UiSchema } from "@rjsf/utils";

// `description` is the markdown body, not a form field.
//
// `ui:description` is here because RJSF falls back to the SCHEMA's description
// when the uiSchema supplies none, and the schema is a machine contract. Under
// the field captioned "Part of" an author was reading "App slugs where this UX
// pattern appears", and under the components field "projected to the graph as
// ux_pattern -> component 'uses_component' edges": a raw graph edge type, one
// layer below where the nomenclature reaches (#646).
//
// The schema prose is CORRECT for its own job and is not touched: presentation
// hints belong to the consumer (editor/README.md, P3). Overriding per field
// keeps that rule without stripping the free help every other field gets.
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
  apps: {
    "ui:title": "Part of",
    "ui:description": "The products where this page shape appears.",
    "ui:options": { addLabel: "product" },
  },
  components: {
    "ui:title": "Built from",
    "ui:description":
      "The design system components this page shape is built from.",
    "ui:options": { addLabel: "component" },
  },
  // Found by looking at the rendered form, not by the guard below, which did
  // not exist yet: `when` was the one field with no `ui:title`, so RJSF fell
  // back to the YAML key and captioned it with a lowercase "when". The raw key
  // is machine text reaching an author, the same defect one field over.
  when: {
    "ui:title": "When to use this",
    "ui:description":
      "When this shape is the right one, and which shape to reach for instead when it is not.",
  },
  tags: {
    "ui:title": "Tags",
    "ui:description":
      "Words a reader would use when looking for this shape. Choosing a layout is a match on these.",
    "ui:options": { addLabel: "tag" },
  },
};
