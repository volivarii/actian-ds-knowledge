// Custom RJSF FieldTemplate for the _meta.yml form. Deliberately does NOT
// render `rawDescription` — the schema's prose is suppressed and re-surfaced
// selectively via a short `ui:help` (inline one-liner, or an ⓘ tooltip when
// `ui:options.helpAsTooltip` is set). Doctrine P3: presentation is the
// editor's call, not the schema's.
import type { FieldTemplateProps } from "@rjsf/utils";
import { Flex, Text, Tooltip } from "@radix-ui/themes";

export function MetaFieldTemplate(props: FieldTemplateProps) {
  const {
    id,
    label,
    children,
    errors,
    hidden,
    required,
    displayLabel,
    uiSchema,
    rawHelp,
  } = props;
  if (hidden) return <div style={{ display: "none" }}>{children}</div>;

  const help = rawHelp;
  // Equivalent to getUiOptions(uiSchema) — reads ui:options from the uiSchema.
  const uiOptions =
    (uiSchema?.["ui:options"] as Record<string, unknown> | undefined) ?? {};
  const helpAsTooltip = uiOptions.helpAsTooltip === true;

  return (
    <div style={{ marginBottom: "var(--space-4, 16px)" }}>
      {displayLabel && label ? (
        <Flex align="center" gap="1" mb="1">
          <Text as="label" htmlFor={id} size="2" weight="medium">
            {label}
            {required ? " *" : ""}
          </Text>
          {helpAsTooltip && help ? (
            <Tooltip content={help}>
              <button
                type="button"
                aria-label={help}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "help",
                  lineHeight: 1,
                  fontSize: "var(--font-size-1)",
                  color: "var(--gray-9)",
                }}
              >
                ⓘ
              </button>
            </Tooltip>
          ) : null}
        </Flex>
      ) : null}
      {children}
      {!helpAsTooltip && help ? (
        <Text as="div" size="1" color="gray" mt="1">
          {help}
        </Text>
      ) : null}
      {errors}
    </div>
  );
}
