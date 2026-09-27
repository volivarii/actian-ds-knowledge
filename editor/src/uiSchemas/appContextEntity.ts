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
    "patterns",
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
  relationships: { "ui:field": "Hidden" },
  // Same field, same edge, same word as the Pattern form. These read
  // "Appears in apps" and "Surfaced in apps" — two labels for one thing.
  apps: { "ui:field": "Hidden" },
  // The one edge from a domain thing into the design system. The description
  // says what an author gets for filling it in, because the payoff is one hop
  // further on than the field itself: a pattern already lists its components, so
  // naming a pattern here is what lets a generated screen reach the components
  // that draw this thing.
  patterns: { "ui:field": "Hidden" },
};
