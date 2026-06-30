// Shared Radix field framing for non-meta forms: a label (with a required
// marker), a muted description, the control, errors, and any ui:help text.
// RJSF sets displayLabel=false for object and array fields, so those skip
// the label here (their own templates render the title). Primitive
// array-item fields have ids ending in `_<index>`; their per-item label is
// redundant in the borderless row layout, so it is suppressed. The _meta
// form overrides this with MetaFieldTemplate via the per-form templates prop.
import type { FieldTemplateProps } from "@rjsf/utils";
import { Box, Text } from "@radix-ui/themes";

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
  } = props;

  if (hidden) return <div style={{ display: "none" }}>{children}</div>;

  // Suppress per-item labels for primitive array items (ids ending in _<index>)
  // for clean borderless rows. Known tradeoff: this also suppresses labels for any
  // object property whose name ends in _<digits> (e.g., col_0), but no current schema uses such properties.
  const isPrimitiveArrayItem = /_\d+$/.test(id);
  const showLabel = displayLabel && !!label && !isPrimitiveArrayItem;

  return (
    <Box style={{ marginBottom: "var(--space-3, 12px)" }}>
      {showLabel ? (
        <Text
          as="label"
          htmlFor={id}
          size="2"
          weight="medium"
          style={{ display: "block", marginBottom: "var(--space-1, 4px)" }}
        >
          {label}
          {required ? " *" : ""}
        </Text>
      ) : null}
      {/* Description visibility intentionally coupled to label visibility: when a
          primitive array item's label is suppressed for clean rows, its description is
          suppressed too (primitive array items carry no schema description in practice). */}
      {showLabel && rawDescription ? (
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
