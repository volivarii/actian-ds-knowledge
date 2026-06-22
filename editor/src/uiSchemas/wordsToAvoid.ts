import type { UiSchema } from "@rjsf/utils";

// Renders content/src/writing/words-to-avoid.md against schemas/content.json:
// show title/nav_order + the wordsToAvoid rows grid (avoid as free-text chips);
// hide the content fields this file doesn't use.
export const wordsToAvoidUiSchema: UiSchema = {
  "ui:order": ["title", "nav_order", "wordsToAvoid", "*"],
  title: { "ui:title": "Title" },
  nav_order: { "ui:title": "Nav order" },
  relatedComponents: { "ui:widget": "hidden" },
  nav_exclude: { "ui:widget": "hidden" },
  search_exclude: { "ui:widget": "hidden" },
  wordsToAvoid: {
    "ui:title": "Words to avoid",
    "ui:options": { addable: true, removable: true, orderable: true },
    items: {
      avoid: { "ui:title": "Avoid (words)", "ui:widget": "TagInput" },
      reason: { "ui:title": "Reason" },
      example: {
        "ui:title": "Example",
        do: { "ui:title": "Do" },
        dont: { "ui:title": "Don't" },
      },
    },
  },
};
