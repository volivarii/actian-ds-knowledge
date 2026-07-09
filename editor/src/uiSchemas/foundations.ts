import type { UiSchema } from "@rjsf/utils";

// foundations/src/*.md frontmatter: optional P8 transversal ref blocks.
// Both arrays render as add/remove/orderable rows of { ref, note }.
export const foundationsUiSchema: UiSchema = {
  "ui:order": ["a11y_refs", "motion_refs", "*"],
  a11y_refs: {
    "ui:title": "Accessibility references",
    "ui:options": { addable: true, removable: true, orderable: true },
    items: {
      ref: { "ui:title": "Section slug" },
      note: { "ui:title": "Note (optional)" },
    },
  },
  motion_refs: {
    "ui:title": "Motion references",
    "ui:options": { addable: true, removable: true, orderable: true },
    items: {
      ref: { "ui:title": "Pattern slug" },
      note: { "ui:title": "Note (optional)" },
    },
  },
};
