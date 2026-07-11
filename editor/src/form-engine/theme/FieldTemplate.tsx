// Shared Radix field framing for non-meta forms: a label (with a required
// marker), the control, errors, and any ui:help text. RJSF sets
// displayLabel=false for object and array fields, so those skip the label
// here (their own templates render the title). Primitive array-item fields
// have ids ending in `_<index>`; their per-item label is redundant in the
// borderless row layout, so it is suppressed. The _meta form overrides
// this with MetaFieldTemplate via the per-form templates prop.
//
// Schema descriptions are HELP ON DEMAND (NN/g progressive disclosure):
// every schema property carries a `description` by repo convention, and
// rendering them all inline made the forms read as a wall of gray. They
// now live behind a keyboard-focusable info glyph next to the label
// (hover or focus shows the text; the aria-label carries it for AT).
// A field can opt back into inline rendering with
// `ui:options.inlineDescription: true` when the prompt is essential.
import type { FieldTemplateProps } from "@rjsf/utils";
import { Box, Flex, Text, Tooltip } from "@radix-ui/themes";

export function FieldTemplate(props: FieldTemplateProps) {
  const {
    id,
    label,
    children,
    errors,
    hidden,
    required,
    displayLabel,
    rawDescription,
    rawHelp,
    uiSchema,
  } = props;

  if (hidden) return <div style={{ display: "none" }}>{children}</div>;

  // Suppress per-item labels for primitive array items (ids ending in _<index>)
  // for clean borderless rows. Known tradeoff: this also suppresses labels for any
  // object property whose name ends in _<digits> (e.g., col_0), but no current schema uses such properties.
  const isPrimitiveArrayItem = /_\d+$/.test(id);
  const showLabel = displayLabel && !!label && !isPrimitiveArrayItem;

  const opts =
    (uiSchema?.["ui:options"] as Record<string, unknown> | undefined) ?? {};
  const inlineDescription = opts.inlineDescription === true;

  return (
    <Box style={{ marginBottom: "var(--space-3, 12px)" }}>
      {showLabel ? (
        <Flex
          align="center"
          gap="1"
          style={{ marginBottom: "var(--space-1, 4px)" }}
        >
          <Text as="label" htmlFor={id} size="2" weight="medium">
            {label}
            {required ? " *" : ""}
          </Text>
          {rawDescription && !inlineDescription ? (
            <Tooltip content={rawDescription}>
              <Text
                size="1"
                color="gray"
                tabIndex={0}
                aria-label={rawDescription}
                style={{ cursor: "help", lineHeight: 1 }}
              >
                ⓘ
              </Text>
            </Tooltip>
          ) : null}
        </Flex>
      ) : null}
      {/* Inline description only when a field opts in — the default lives
          in the info glyph above. Coupled to label visibility as before. */}
      {showLabel && rawDescription && inlineDescription ? (
        <Text as="div" size="1" color="gray" mb="1">
          {rawDescription}
        </Text>
      ) : null}
      {children}
      {rawHelp ? (
        <Text as="div" size="1" color="gray" mt="1">
          {rawHelp}
        </Text>
      ) : null}
      {errors}
    </Box>
  );
}
