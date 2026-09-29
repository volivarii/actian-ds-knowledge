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
  // These three rendered with their raw keys: "header", "sidebar", "useCases".
  // A field with no `ui:title` is captioned by RJSF with the YAML key, which is
  // machine text reaching an author, the same defect as the schema prose above
  // (#646). Two of them sit inside a COLLAPSED group, which is why nobody had
  // noticed: collapsed is not hidden.
  header: {
    "ui:title": "Header",
    "ui:description":
      "Which product chrome this app draws at the top of every page.",
    // The object's single child renders as its own field, captioned with the
    // key `type` until told otherwise. Seen on the rendered form, not deduced.
    type: {
      "ui:title": "Header variant",
      "ui:description":
        "The header this product draws. Matches the design system's global header.",
    },
    context: {
      "ui:title": "Context switcher",
      "ui:description":
        "The switcher left of the search, as the product shows it.",
      label: {
        "ui:title": "Switcher caption",
        "ui:description": "The small word above the value, such as Catalog.",
      },
      value: {
        "ui:title": "Switcher value",
        "ui:description": "The value it shows, such as Default.",
      },
    },
    search: {
      "ui:title": "Search",
      "ui:description": "The header's search field.",
      scope: {
        "ui:title": "Search scope",
        "ui:description": "The value of the dropdown before the field.",
      },
      placeholder: {
        "ui:title": "Search placeholder",
        "ui:description": "The field's placeholder, exactly as shown.",
      },
    },
    actions: {
      "ui:title": "Header actions",
      "ui:description":
        "The actions at the right of the header, left to right, such as whats-new or avatar.",
      "ui:options": { addLabel: "action" },
    },
  },
  sidebar: {
    "ui:title": "Left navigation",
    "ui:description":
      "The nav entries this product shows, in the order they appear.",
    "ui:options": { addLabel: "nav item" },
    items: {
      label: {
        "ui:title": "Nav label",
        "ui:description": "What the reader sees in the navigation.",
      },
      id: {
        "ui:title": "Nav id",
        "ui:description":
          "The name this entry is referred to by elsewhere. Lower case, hyphens for spaces.",
      },
      icon: {
        "ui:title": "Icon",
        "ui:description":
          "The design system icon the entry shows. Leave empty when no source names one.",
      },
      group: {
        "ui:title": "Group",
        "ui:description":
          "Entries next to each other with the same group are drawn together, with a divider where the group changes.",
      },
      position: {
        "ui:title": "Position",
        "ui:description":
          "Bottom puts the entry in the block anchored to the foot of the navigation.",
      },
      kind: {
        "ui:title": "Kind",
        "ui:description":
          "Link goes somewhere; action does something, such as New Item.",
      },
      children: {
        "ui:title": "Sub-items",
        "ui:description": "Entries drawn under this one.",
        "ui:options": { addLabel: "sub-item" },
        items: {
          label: {
            "ui:title": "Sub-item label",
            "ui:description": "What the reader sees in the navigation.",
          },
          id: {
            "ui:title": "Sub-item id",
            "ui:description":
              "The name this sub-item is referred to by elsewhere. Lower case, hyphens for spaces.",
          },
        },
      },
    },
  },
  useCases: {
    "ui:title": "Use cases",
    "ui:description":
      "Who uses this product, what they are trying to do, and the page shapes that serve them.",
    "ui:options": { addLabel: "use case" },
    items: {
      audience: {
        "ui:title": "Audience",
        "ui:description": "Who this use case is for.",
        "ui:options": { addLabel: "audience" },
      },
      jobs: {
        "ui:title": "Jobs",
        "ui:description": "What they are trying to get done.",
        "ui:options": { addLabel: "job" },
      },
      // Its schema prose ends "enforced by validate-app-context.js", a script
      // name reaching an author. Nested one level below where the first pass
      // of this fix looked, and below where its guard looked either.
      patterns: {
        "ui:title": "Page shapes",
        "ui:description":
          "The page shapes that serve this use case, in this product.",
        "ui:options": { addLabel: "page shape" },
      },
    },
  },
};
