// Radix-themed array container: the array's own title and description (RJSF
// sets displayLabel=false on the field template for arrays, so the title lives
// here), the item rows, then the Add button. The item template and Add button
// resolve from the registry so overrides apply.
//
// Import note: @rjsf/utils ships CJS (dist/index.js) with no `exports` field.
// Node's ESM runtime can't resolve named exports from CJS via static analysis,
// so we use `* as` and extract at runtime, matching the @rjsf/core pattern in
// RJSFForm.tsx.
import type { ArrayFieldTemplateProps } from "@rjsf/utils";
import * as rjsfUtilsMod from "@rjsf/utils";
import { Box, Text } from "@radix-ui/themes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _rjsfUtilsAny = rjsfUtilsMod as any;
const getUiOptions: (uiSchema?: Record<string, unknown>, globalOptions?: Record<string, unknown>) => Record<string, unknown> =
  typeof _rjsfUtilsAny?.getUiOptions === "function"
    ? _rjsfUtilsAny.getUiOptions
    : typeof _rjsfUtilsAny?.default?.getUiOptions === "function"
      ? _rjsfUtilsAny.default.getUiOptions
      : () => ({});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTemplate: (name: string, registry: any, uiOptions?: Record<string, unknown>) => any =
  typeof _rjsfUtilsAny?.getTemplate === "function"
    ? _rjsfUtilsAny.getTemplate
    : typeof _rjsfUtilsAny?.default?.getTemplate === "function"
      ? _rjsfUtilsAny.default.getTemplate
      : (name: string, registry: any) => registry?.templates?.[name];

export function ArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const {
    canAdd,
    disabled,
    idSchema,
    uiSchema,
    items,
    onAddClick,
    readonly,
    registry,
    required,
    schema,
    title,
  } = props;
  const uiOptions = getUiOptions(uiSchema as Record<string, unknown>);
  const ItemTemplate = getTemplate("ArrayFieldItemTemplate", registry, uiOptions);
  const { AddButton } = registry.templates.ButtonTemplates;
  const fieldTitle = (uiOptions.title as string) || title;
  const description = (uiOptions.description as string) || schema.description;

  return (
    <Box id={idSchema.$id} mb="3">
      {fieldTitle ? (
        <Text as="div" size="2" weight="medium" mb="1">
          {fieldTitle}
          {required ? " *" : ""}
        </Text>
      ) : null}
      {description ? (
        <Text as="div" size="1" color="gray" mb="2">
          {description}
        </Text>
      ) : null}
      <Box>
        {items &&
          items.map(({ key, ...itemProps }) => <ItemTemplate key={key} {...itemProps} />)}
      </Box>
      {canAdd ? (
        <AddButton
          onClick={onAddClick}
          disabled={disabled || readonly}
          uiSchema={uiSchema}
          registry={registry}
        />
      ) : null}
    </Box>
  );
}
