// A11yCoverageView — read-only presentational view of per-topic a11y coverage.
//
// Renders a table of accessibility topics (sorted gaps-first by computeTopicCoverage)
// and a thin-components worklist below. Pure display + navigation; no writes.
//
// Sibling of CoverageDashboard. Loaded by A11yCoverageDashboard.

import { Box, Badge, Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { TopicCoverage, ThinComponent, TopicState } from "../lib/a11yCoverage";

const STATE_COLOR: Record<TopicState, "gray" | "amber" | "red" | "green"> = {
  "well-hosted": "green",
  "single-host": "amber",
  "category-only": "gray",
  orphan: "red",
};

const STATE_LABEL: Record<TopicState, string> = {
  "well-hosted": "well hosted",
  "single-host": "single host",
  "category-only": "category only",
  orphan: "orphan",
};

export interface A11yCoverageViewProps {
  topics: TopicCoverage[];
  thin: ThinComponent[];
  onOpenFile: (path: string) => void;
}

export function A11yCoverageView({ topics, thin, onOpenFile }: A11yCoverageViewProps) {
  return (
    <Box p="5" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Heading size="5" mb="1">
        Accessibility coverage
      </Heading>
      <Text size="2" color="gray" mb="3" as="p">
        Per-component a11y topic coverage. Click a component to edit its accessibility topics.
      </Text>

      <Table.Root variant="surface" size="1">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Topic</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>State</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Hosted by</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {topics.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={3}>
                <Text color="gray">No accessibility topics found.</Text>
              </Table.Cell>
            </Table.Row>
          )}
          {topics.map((t) => (
            <Table.Row key={t.slug}>
              <Table.RowHeaderCell>
                <Text>{t.title}</Text>
              </Table.RowHeaderCell>
              <Table.Cell>
                <Badge color={STATE_COLOR[t.state]} variant="soft" size="1">
                  {STATE_LABEL[t.state]}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                {t.componentHosts.length > 0 ? (
                  <Flex gap="1" wrap="wrap">
                    {t.componentHosts.map((h) => (
                      <Text
                        key={h.slug}
                        size="2"
                        style={{ cursor: "pointer" }}
                        onClick={() => onOpenFile(`components/src/${h.slug}/_meta.yml`)}
                      >
                        {h.name}
                      </Text>
                    ))}
                  </Flex>
                ) : t.state === "category-only" ? (
                  <Text size="2" color="gray">
                    on {t.categoryHosts.join(", ")} category
                  </Text>
                ) : (
                  <Text size="2" color="gray">
                    —
                  </Text>
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>

      <Heading size="3" mt="5" mb="2">
        Needs attention
      </Heading>
      {thin.length > 0 ? (
        <>
          <Text size="2" mb="2" as="p">
            {thin.length} component{thin.length === 1 ? "" : "s"} have no a11y topics yet — click to add if applicable.
          </Text>
          <Flex gap="1" wrap="wrap">
            {thin.map((c) => (
              <Text
                key={c.slug}
                size="2"
                color="gray"
                style={{ cursor: "pointer" }}
                onClick={() => onOpenFile(`components/src/${c.slug}/_meta.yml`)}
              >
                {c.component}
              </Text>
            ))}
          </Flex>
        </>
      ) : (
        <Text size="2" color="gray">
          All documented components carry a11y topics.
        </Text>
      )}
    </Box>
  );
}
