// Generic root ObjectFieldTemplate for frontmatter forms.
//
// Sanity-style field grouping (the verified remedy for "RJSF forms feel
// complicated": NN/g progressive disclosure + collapsible fieldsets):
// the root uiSchema may declare
//
//   "ui:options": {
//     groups: [
//       { title, fields: [...], collapsed?: boolean, note?: string },
//     ],
//   }
//
// Ungrouped fields lead (always visible, in ui:order). Each group renders
// as a quietly-labeled section — the same uppercase wayfinding label the
// _meta form and the sidebar dimension headers use — expanded by default,
// or as a collapsed <details> disclosure when `collapsed: true` (the shape
// for Figma-synced / system-managed fields authors shouldn't wade through).
// Values in collapsed groups still round-trip via formData.
//
// Generic by design: with no `groups`, it falls back to a plain vertical
// stack. Non-root objects (array items, nested maps) also fall back.
import type { ReactNode } from "react";
import type { ObjectFieldTemplateProps } from "@rjsf/utils";
import { Box, Text } from "@radix-ui/themes";

type Properties = ObjectFieldTemplateProps["properties"];

export interface FieldGroup {
  title: string;
  fields: string[];
  collapsed?: boolean;
  note?: string;
}

function Stack({ items }: { items: Properties }) {
  return (
    <>
      {items.map((p) => (
        <Box key={p.name}>{p.content}</Box>
      ))}
    </>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      as="div"
      size="1"
      weight="bold"
      color="gray"
      style={{ letterSpacing: "0.05em", textTransform: "uppercase" }}
    >
      {children}
    </Text>
  );
}

function parseGroups(opts: Record<string, unknown>): FieldGroup[] {
  if (!Array.isArray(opts.groups)) return [];
  return (opts.groups as unknown[]).filter(
    (g): g is FieldGroup =>
      !!g &&
      typeof g === "object" &&
      typeof (g as FieldGroup).title === "string" &&
      Array.isArray((g as FieldGroup).fields),
  );
}

export function FrontmatterObjectFieldTemplate(
  props: ObjectFieldTemplateProps,
) {
  const { idSchema, properties, uiSchema } = props;
  const isRoot = idSchema?.$id === "root";

  const opts =
    (uiSchema?.["ui:options"] as Record<string, unknown> | undefined) ?? {};
  const groups = parseGroups(opts);

  // Non-root objects, or a root with no grouping → plain stack.
  if (!isRoot || groups.length === 0) {
    return (
      <Box>
        <Stack items={properties} />
      </Box>
    );
  }

  const grouped = new Set(groups.flatMap((g) => g.fields));
  // `properties` arrive already in ui:order order; preserve it everywhere.
  const lead = properties.filter((p) => !grouped.has(p.name));

  return (
    <Box>
      <Stack items={lead} />
      {groups.map((group) => {
        const members = properties.filter((p) =>
          group.fields.includes(p.name),
        );
        if (members.length === 0) return null;
        if (group.collapsed) {
          return (
            <details
              key={group.title}
              style={{
                marginTop: "var(--space-4, 16px)",
                border: "1px solid var(--gray-5)",
                borderRadius: 6,
                padding: "var(--space-3, 12px)",
                background: "var(--gray-2)",
              }}
            >
              <summary style={{ cursor: "pointer" }}>
                <GroupLabel>{group.title}</GroupLabel>
              </summary>
              {group.note ? (
                <Text as="div" size="1" color="gray" mt="1" mb="2">
                  {group.note}
                </Text>
              ) : null}
              <Box mt="2">
                <Stack items={members} />
              </Box>
            </details>
          );
        }
        return (
          <Box key={group.title} mt="4">
            <Box mb="2">
              <GroupLabel>{group.title}</GroupLabel>
              {group.note ? (
                <Text as="div" size="1" color="gray" mt="1">
                  {group.note}
                </Text>
              ) : null}
            </Box>
            <Stack items={members} />
          </Box>
        );
      })}
    </Box>
  );
}
