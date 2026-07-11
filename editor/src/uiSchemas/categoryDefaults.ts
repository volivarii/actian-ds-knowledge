import type { UiSchema } from "@rjsf/utils";

export const categoryDefaultsUiSchema: UiSchema = {
  // Editable, author-owned fields lead; the Figma-sourced facts
  // (anatomy/variants/confidence) trail and are grouped into a collapsed,
  // disabled (greyed-out, non-editable) "Synced from Figma" disclosure by
  // FrontmatterObjectFieldTemplate. Their values still round-trip via formData.
  "ui:order": [
    "label",
    "slug",
    "authoring_status",
    "last_reviewed",
    "a11y_refs",
    "motion_refs",
    "foundations_refs",
    "anatomy",
    "variants",
    "confidence",
    "_schema_version",
    "_extends",
    "*",
  ],
  "ui:options": {
    groups: [
      {
        title: "Synced from Figma",
        fields: ["anatomy", "variants", "confidence"],
        collapsed: true,
        note: "These fields are sourced from Figma and aren't edited here — they're shown for reference and saved unchanged.",
      },
    ],
  },
  _schema_version: { "ui:readonly": true },
  slug: { "ui:title": "Slug", "ui:readonly": true },
  label: { "ui:title": "Category label", "ui:placeholder": "e.g. Action" },
  authoring_status: { "ui:title": "Authoring status" },
  last_reviewed: {
    "ui:title": "Last reviewed",
    "ui:placeholder": "2026-05-23",
  },
  anatomy: {
    "ui:title": "Anatomy (shared parts)",
    "ui:disabled": true,
    "ui:options": { addable: false, removable: false, orderable: false },
  },
  variants: {
    "ui:title": "Variant axes",
    "ui:disabled": true,
    "ui:options": { addable: false, removable: false, orderable: false },
  },
  confidence: { "ui:title": "Confidence", "ui:disabled": true },
  a11y_refs: {
    "ui:title": "Accessibility topics",
    "ui:widget": "RefArray",
    "ui:options": { refDomain: "accessibility" },
  },
  motion_refs: {
    "ui:title": "Motion patterns",
    "ui:widget": "RefArray",
    "ui:options": { refDomain: "motion" },
  },
  foundations_refs: {
    "ui:title": "Foundations",
    "ui:widget": "RefArray",
    "ui:options": { refDomain: "foundations" },
  },
  _extends: { "ui:widget": "hidden" },
};
