// Shared Radix theme for RJSF. Registered as the base in RJSFForm; per-form
// templates/widgets override it.
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
import { TextareaWidget, SelectWidget } from "./widgets";

export const radixTheme = {
  templates: {
    ButtonTemplates: { AddButton, MoveUpButton, MoveDownButton, RemoveButton },
    ArrayFieldTemplate,
    ArrayFieldItemTemplate,
    BaseInputTemplate,
    FieldTemplate,
  },
  widgets: { TextareaWidget, SelectWidget },
};
