// Shared Radix theme for RJSF. Registered as the base in RJSFForm; per-form
// templates/widgets override it. The textarea/select widgets are added in the
// next task.
import {
  AddButton,
  MoveUpButton,
  MoveDownButton,
  RemoveButton,
} from "./ButtonTemplates";
import { ArrayFieldTemplate } from "./ArrayFieldTemplate";
import { ArrayFieldItemTemplate } from "./ArrayFieldItemTemplate";
import { BaseInputTemplate } from "./BaseInputTemplate";
import { FieldTemplate } from "./FieldTemplate";

export const radixTheme = {
  templates: {
    ButtonTemplates: { AddButton, MoveUpButton, MoveDownButton, RemoveButton },
    ArrayFieldTemplate,
    ArrayFieldItemTemplate,
    BaseInputTemplate,
    FieldTemplate,
  },
  widgets: {},
};
