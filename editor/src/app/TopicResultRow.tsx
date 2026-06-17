import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import type { Domain, SearchResult } from "../substrate";

export interface TopicResultRowProps {
  result: SearchResult;
  selected?: boolean;
  onClick?: () => void;
}

// Domain → author-facing label + badge colour.
// Never expose raw domain strings (e.g. "accessibility") as badge labels —
// the doctrine-guards test forbids "a11y_refs", "motion_refs",
// "foundations_refs", "relatedComponents" in rendered UI. This lookup also
// maps "accessibility" → "Accessibility" so the badge reads as a label, not
// an internal slug.
const DOMAIN_DISPLAY: Record<
  Domain,
  { label: string; color: "blue" | "amber" | "green" | "violet" | "cyan" }
> = {
  accessibility: { label: "Accessibility", color: "blue" },
  motion: { label: "Motion", color: "amber" },
  foundations: { label: "Foundations", color: "green" },
  component: { label: "Component", color: "violet" },
  content: { label: "Content", color: "cyan" },
};

// Presentational row for a topic search result: title + domain badge + body
// excerpt. Never renders the slug (vocabulary doctrine).
export function TopicResultRow({
  result,
  selected,
  onClick,
}: TopicResultRowProps) {
  const display = DOMAIN_DISPLAY[result.domain] ?? {
    label: result.domain,
    color: "violet" as const,
  };
  return (
    <Box
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        padding: "10px 12px",
        background: selected ? "var(--accent-3)" : "var(--gray-2)",
        borderLeft: selected
          ? "3px solid var(--accent-9)"
          : "3px solid transparent",
        borderRadius: 4,
      }}
    >
      <Flex justify="between" align="center" gap="2" mb="1">
        <Text weight="medium" size="2">
          {result.title}
        </Text>
        <Badge color={display.color} size="1" style={{ flexShrink: 0 }}>
          {display.label}
        </Badge>
      </Flex>
      {result.body ? (
        <Text
          size="2"
          color="gray"
          as="p"
          style={{ lineHeight: 1.45, marginTop: 4 }}
        >
          {result.body.slice(0, 110)}
          {result.body.length > 110 ? "…" : ""}
        </Text>
      ) : null}
    </Box>
  );
}
