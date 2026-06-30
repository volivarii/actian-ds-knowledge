// Radix-themed array container: the array's own title and description (RJSF
// sets displayLabel=false on the field template for arrays, so the title lives
// here), the item rows, then the Add button. The item template and Add button
// resolve from the registry so overrides apply.
import type { ArrayFieldTemplateProps } from "@rjsf/utils";
import { Box, Text } from "@radix-ui/themes";
import { getUiOptions, getTemplate } from "./rjsfUtils";

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
  const ItemTemplate = getTemplate(
    "ArrayFieldItemTemplate",
    registry,
    uiOptions,
  );
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
          items.map(({ key, ...itemProps }) => (
            <ItemTemplate key={key} {...itemProps} />
          ))}
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
