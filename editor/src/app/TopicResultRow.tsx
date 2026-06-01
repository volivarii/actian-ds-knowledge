import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import type { SearchResult } from "../substrate";

export interface TopicResultRowProps {
  result: SearchResult;
  selected?: boolean;
  onClick?: () => void;
}

// Presentational row for an a11y/motion topic search result: title + domain
// badge + body excerpt. Never renders the slug (vocabulary doctrine).
export function TopicResultRow({ result, selected, onClick }: TopicResultRowProps) {
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
        <Badge
          color={result.domain === "accessibility" ? "blue" : "amber"}
          size="1"
          style={{ flexShrink: 0 }}
        >
          {result.domain}
        </Badge>
      </Flex>
      {result.body ? (
        <Text size="2" color="gray" as="p" style={{ lineHeight: 1.45, marginTop: 4 }}>
          {result.body.slice(0, 110)}
          {result.body.length > 110 ? "…" : ""}
        </Text>
      ) : null}
    </Box>
  );
}
