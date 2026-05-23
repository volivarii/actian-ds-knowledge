// Generic RJSF wrapper. Keeps the schema-driven editing contract in one
// place: a JSON Schema in → a React form out, validated by Ajv 8.
//
// Per-domain schemas (guideline-meta, app-context, fm-to-ds-map, icon-groups)
// each ship a paired uiSchema under editor/src/uiSchemas/. Task 17 polishes
// the widget set to match Radix theming throughout.

import type { ComponentProps } from "react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";

export interface RJSFFormProps {
  schema: RJSFSchema;
  uiSchema?: UiSchema;
  formData: unknown;
  onChange: (next: unknown) => void;
  onSubmit?: (data: unknown) => void;
  disabled?: boolean;
  submitLabel?: string;
  children?: ComponentProps<typeof Form>["children"];
}

export function RJSFForm({
  schema,
  uiSchema,
  formData,
  onChange,
  onSubmit,
  disabled,
  submitLabel,
  children,
}: RJSFFormProps) {
  return (
    <Form
      schema={schema}
      uiSchema={uiSchema}
      validator={validator}
      formData={formData}
      disabled={disabled}
      onChange={(e) => onChange(e.formData)}
      onSubmit={(e) => onSubmit?.(e.formData)}
      showErrorList="bottom"
    >
      {children ?? (
        <div style={{ display: "flex", gap: "var(--space-2, 8px)" }}>
          <button type="submit" disabled={disabled}>
            {submitLabel ?? "Submit"}
          </button>
        </div>
      )}
    </Form>
  );
}
