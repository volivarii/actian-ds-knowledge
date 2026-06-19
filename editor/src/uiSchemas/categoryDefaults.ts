import type { UiSchema } from "@rjsf/utils";

export const categoryDefaultsUiSchema: UiSchema = {
  "ui:order": [
    "label",
    "slug",
    "authoring_status",
    "confidence",
    "last_reviewed",
    "anatomy",
    "variants",
    "a11y_refs",
    "motion_refs",
    "foundations_refs",
    "_schema_version",
    "_extends",
    "*",
  ],
  _schema_version: { "ui:readonly": true },
  slug: { "ui:title": "Slug", "ui:readonly": true },
  label: { "ui:title": "Category label", "ui:placeholder": "e.g. Action" },
  authoring_status: { "ui:title": "Authoring status" },
  last_reviewed: { "ui:title": "Last reviewed", "ui:placeholder": "2026-05-23" },
  anatomy: {
    "ui:title": "Anatomy (shared parts)",
    items: {
      name: { "ui:placeholder": "e.g. Container" },
      description: { "ui:placeholder": "one sentence" },
    },
  },
  variants: {
    "ui:title": "Variant axes",
    items: { axis: { "ui:placeholder": "e.g. Style" } },
  },
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
