// Generic root ObjectFieldTemplate for frontmatter forms.
//
// Reads `ui:options.syncedFields` from the root uiSchema and tucks those
// fields into a collapsed disclosure below the editable fields. The intent:
// a category's `anatomy`/`variants`/`confidence` are sourced from Figma and
// must not be hand-edited here — they are marked `ui:readonly` AND grouped
// out of the way so authors focus on the prose/refs they own. The values
// still round-trip via formData (RJSF keeps read-only field data).
//
// Generic by design (Slice 2 reuses the screen): with no `syncedFields`,
// it falls back to a plain vertical stack. Non-root objects (array items,
// nested maps) also fall back to a plain stack.
import type { ObjectFieldTemplateProps } from "@rjsf/utils";
import { Box, Text } from "@radix-ui/themes";

type Properties = ObjectFieldTemplateProps["properties"];

function Stack({ items }: { items: Properties }) {
  return (
    <>
      {items.map((p) => (
        <Box key={p.name}>{p.content}</Box>
      ))}
    </>
  );
}

export function FrontmatterObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { idSchema, properties, uiSchema } = props;
  const isRoot = idSchema?.$id === "root";

  const opts =
    (uiSchema?.["ui:options"] as Record<string, unknown> | undefined) ?? {};
  const syncedNames = Array.isArray(opts.syncedFields)
    ? (opts.syncedFields as string[])
    : [];

  // Non-root objects, or a root with nothing to tuck away → plain stack.
  if (!isRoot || syncedNames.length === 0) {
    return (
      <Box>
        <Stack items={properties} />
      </Box>
    );
  }

  const syncedTitle =
    typeof opts.syncedTitle === "string" ? opts.syncedTitle : "Synced fields";
  const syncedNote =
    typeof opts.syncedNote === "string" ? opts.syncedNote : null;

  const synced = new Set(syncedNames);
  // `properties` arrive already in ui:order order; preserve it for both groups.
  const lead = properties.filter((p) => !synced.has(p.name));
  const syncedProps = properties.filter((p) => synced.has(p.name));

  return (
    <Box>
      <Stack items={lead} />
      {syncedProps.length > 0 ? (
        <details
          style={{
            marginTop: "var(--space-4, 16px)",
            border: "1px solid var(--gray-5)",
            borderRadius: 6,
            padding: "var(--space-3, 12px)",
            background: "var(--gray-2)",
          }}
        >
          <summary style={{ cursor: "pointer" }}>
            <Text size="2" weight="bold">
              {syncedTitle}
            </Text>
          </summary>
          {syncedNote ? (
            <Text as="div" size="1" color="gray" mt="1" mb="2">
              {syncedNote}
            </Text>
          ) : null}
          <Box mt="2">
            <Stack items={syncedProps} />
          </Box>
        </details>
      ) : null}
    </Box>
  );
}
