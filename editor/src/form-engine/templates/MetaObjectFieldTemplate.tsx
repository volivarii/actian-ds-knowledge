// Custom RJSF root ObjectFieldTemplate for the _meta.yml form.
// Groups the meaningful fields into two labeled sections, renders
// `lastReviewed` as a quiet footer, and OMITS the `domains` status matrix
// from rendering — domains is derived (file presence + git) and managed in
// the Authoring Workspace, not edited here. Its value still round-trips
// because RJSF keeps unrendered formData (guarded by a submit test).
// Non-root objects (e.g. `examples` items) fall back to a plain stack.
import type { ReactNode } from "react";
import type { ObjectFieldTemplateProps } from "@rjsf/utils";
import { Box, Text } from "@radix-ui/themes";

const IDENTITY = ["component", "category", "section"];
const RELATIONSHIPS = ["related", "a11y_refs", "examples"];
const FOOTER = ["lastReviewed"];
const OMIT = ["domains"];
const KNOWN = new Set([...IDENTITY, ...RELATIONSHIPS, ...FOOTER, ...OMIT]);

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box mb="5">
      <Text
        as="div"
        size="1"
        weight="bold"
        color="gray"
        mb="3"
        style={{ letterSpacing: "0.05em", textTransform: "uppercase" }}
      >
        {title}
      </Text>
      {children}
    </Box>
  );
}

export function MetaObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { idSchema, properties } = props;
  const isRoot = idSchema?.$id === "root";

  if (!isRoot) {
    return (
      <Box>
        {properties.map((p) => (
          <Box key={p.name}>{p.content}</Box>
        ))}
      </Box>
    );
  }

  const byName = new Map(properties.map((p) => [p.name, p]));
  const pick = (names: string[]) =>
    names
      .map((n) => byName.get(n))
      .filter((p): p is (typeof properties)[number] => Boolean(p));
  // Forward-safety: any future schema field not in a known bucket still
  // renders (appended to Relationships) rather than silently vanishing.
  const leftovers = properties.filter((p) => !KNOWN.has(p.name));

  return (
    <Box>
      <Section title="Identity">
        {pick(IDENTITY).map((p) => (
          <Box key={p.name}>{p.content}</Box>
        ))}
      </Section>
      <Section title="Relationships">
        {pick(RELATIONSHIPS).map((p) => (
          <Box key={p.name}>{p.content}</Box>
        ))}
        {leftovers.map((p) => (
          <Box key={p.name}>{p.content}</Box>
        ))}
      </Section>
      {pick(FOOTER).map((p) => (
        <Box
          key={p.name}
          style={{
            borderTop: "1px dashed var(--gray-5)",
            paddingTop: "var(--space-3, 12px)",
            marginTop: "var(--space-2, 8px)",
          }}
        >
          {p.content}
        </Box>
      ))}
      {/* `domains` intentionally not rendered — round-trips via formData */}
    </Box>
  );
}
