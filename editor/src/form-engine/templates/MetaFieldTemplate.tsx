// Custom RJSF FieldTemplate for the _meta.yml form. Deliberately does NOT
// render `rawDescription` — the schema's prose is suppressed and re-surfaced
// selectively via a short `ui:help` (inline one-liner, or an ⓘ tooltip when
// `ui:options.helpAsTooltip` is set). Doctrine P3: presentation is the
// editor's call, not the schema's.
import type { FieldTemplateProps } from "@rjsf/utils";
import { Flex, Text, Tooltip } from "@radix-ui/themes";

export function MetaFieldTemplate(props: FieldTemplateProps) {
  const { id, label, children, errors, hidden, required, displayLabel, uiSchema } =
    props;
  if (hidden) return <div style={{ display: "none" }}>{children}</div>;

  const help = (uiSchema?.["ui:help"] as string | undefined) ?? undefined;
  const helpAsTooltip =
    ((uiSchema?.["ui:options"] as Record<string, unknown> | undefined)
      ?.helpAsTooltip ?? false) === true;

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
              <Text
                size="1"
                color="gray"
                aria-label={help}
                style={{ cursor: "help" }}
              >
                ⓘ
              </Text>
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
