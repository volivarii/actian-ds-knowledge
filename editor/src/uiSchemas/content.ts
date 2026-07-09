import type { UiSchema } from "@rjsf/utils";

// Generic content/src/**.md frontmatter form. Shows substance only
// (title + related components); nav fields are hidden but preserved in
// formData so they round-trip untouched (substrate-only: docs nav is a
// consumer concern, not editable here). words-to-avoid.md uses its own
// uiSchema (uiSchemas/wordsToAvoid.ts) and is routed before this entry.
export const contentUiSchema: UiSchema = {
  "ui:order": ["title", "relatedComponents", "*"],
  title: { "ui:title": "Title" },
  relatedComponents: {
    "ui:title": "Related components",
    "ui:widget": "RefArray",
  },
  nav_order: { "ui:widget": "hidden" },
  nav_exclude: { "ui:widget": "hidden" },
  search_exclude: { "ui:widget": "hidden" },
  wordsToAvoid: { "ui:widget": "hidden" },
};
