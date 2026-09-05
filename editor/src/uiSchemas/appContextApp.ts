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
