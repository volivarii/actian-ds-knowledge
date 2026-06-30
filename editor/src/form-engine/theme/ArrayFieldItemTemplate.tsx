// Borderless inline array-item row: a muted index marker on the left, the item
// content filling the available width, and a right-aligned control cluster
// (Move up / Move down / Remove). Move-up disables on the first item and
// move-down on the last (RJSF passes hasMoveUp/hasMoveDown). Buttons resolve
// from the registry so per-form ButtonTemplates overrides still apply.
import type { ArrayFieldTemplateItemType } from "@rjsf/utils";
import { Box, Flex, Text } from "@radix-ui/themes";

export function ArrayFieldItemTemplate(props: ArrayFieldTemplateItemType) {
  const {
    children,
    index,
    disabled,
    readonly,
    hasMoveUp,
    hasMoveDown,
    hasRemove,
    onReorderClick,
    onDropIndexClick,
    registry,
    uiSchema,
  } = props;
  const { MoveUpButton, MoveDownButton, RemoveButton } = registry.templates.ButtonTemplates;
  const hasControls = hasMoveUp || hasMoveDown || hasRemove;

  return (
    <Flex align="start" gap="2" mb="1">
      <Text size="1" color="gray" aria-hidden style={{ paddingTop: 6, minWidth: 18, userSelect: "none" }}>
        {`⋮${index + 1}`}
      </Text>
      <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
      {hasControls ? (
        <Flex gap="1" style={{ paddingTop: 4 }}>
          {(hasMoveUp || hasMoveDown) && (
            <MoveUpButton
              disabled={disabled || readonly || !hasMoveUp}
              onClick={onReorderClick(index, index - 1)}
              uiSchema={uiSchema}
              registry={registry}
            />
          )}
          {(hasMoveUp || hasMoveDown) && (
            <MoveDownButton
              disabled={disabled || readonly || !hasMoveDown}
              onClick={onReorderClick(index, index + 1)}
              uiSchema={uiSchema}
              registry={registry}
            />
          )}
          {hasRemove && (
            <RemoveButton
              disabled={disabled || readonly}
              onClick={onDropIndexClick(index)}
              uiSchema={uiSchema}
              registry={registry}
            />
          )}
        </Flex>
      ) : null}
    </Flex>
  );
}
