// Shared Radix theme for RJSF. Registered as the base in RJSFForm; per-form
// templates/widgets override it. Grows across tasks: BaseInputTemplate,
// FieldTemplate, and the textarea/select widgets are added in later tasks.
import { AddButton, MoveUpButton, MoveDownButton, RemoveButton } from "./ButtonTemplates";
import { ArrayFieldTemplate } from "./ArrayFieldTemplate";
import { ArrayFieldItemTemplate } from "./ArrayFieldItemTemplate";

export const radixTheme = {
  templates: {
    ButtonTemplates: { AddButton, MoveUpButton, MoveDownButton, RemoveButton },
    ArrayFieldTemplate,
    ArrayFieldItemTemplate,
  },
  widgets: {},
};
