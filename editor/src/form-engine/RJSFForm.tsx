// Generic RJSF wrapper. Keeps the schema-driven editing contract in one
// place: a JSON Schema in → a React form out, validated by Ajv 8.
//
// Per-domain schemas (guideline-meta, app-context, fm-to-ds-map, icon-groups)
// each ship a paired uiSchema under editor/src/uiSchemas/. Task 17 polishes
// the widget set to match Radix theming throughout.

import type { ComponentProps } from "react";
import Form from "@rjsf/core";
// The default @rjsf/validator-ajv8 export targets draft-07; the knowledge
// repo's schemas are draft-2020-12. customizeValidator + Ajv2020 swaps the
// validator at build time without leaking through to consumers.
//
// Import shape note: @rjsf/validator-ajv8 ships CJS via `main` with no
// `exports` field, so Node's ESM bridge surfaces only `default`. Destructure
// `customizeValidator` off the default rather than as a named import — both
// Vite (browser) and tsx (tests) resolve this consistently.
import rjsfValidatorAjv8 from "@rjsf/validator-ajv8";
import Ajv2020 from "ajv/dist/2020";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";

const { customizeValidator } = rjsfValidatorAjv8 as unknown as {
  customizeValidator: (opts: {
    AjvClass?: unknown;
    ajvOptionsOverrides?: Record<string, unknown>;
  }) => unknown;
};

const validator = customizeValidator({
  AjvClass: Ajv2020,
  ajvOptionsOverrides: { strict: false, allowUnionTypes: true },
}) as ComponentProps<typeof Form>["validator"];

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
