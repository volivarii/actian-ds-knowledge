// Typed "Referenced by" view: who points AT the current node, read from the
// baked knowledge graph (graphIndex.referencedBy) — replacing the markdown-
// anchor fake (which showed raw file paths). Grouped by relationship with
// HUMAN labels; shows neighbor TITLES (never ids/slugs) per the vocabulary
// doctrine guard. Click-to-navigate is deferred (PR3c+); titles are read-only.
import React from "react";
import { Box, Flex, Text } from "@radix-ui/themes";
import {
  bakedGraphIndex,
  type GraphIndex,
  type Neighbor,
} from "../substrate/graphIndex";

// Human, doctrine-safe labels for INCOMING edges (describe the citing relationship).
// Wording is first-pass — refine in the dogfood pass.
const INCOMING_LABEL: Record<string, string> = {
  a11y_ref: "Cited as an accessibility requirement by",
  foundations_ref: "Cited as a foundation by",
  motion_ref: "Cited as a motion pattern by",
  related: "Related content",
  in_category: "Components in this category",
  narrower: "Broader topic",
};
function labelFor(edgeType: string): string {
  return INCOMING_LABEL[edgeType] ?? "Referenced by";
}

export interface NeighborhoodPanelProps {
  nodeId: string;
  index?: GraphIndex;
}

export function NeighborhoodPanel({
  nodeId,
  index = bakedGraphIndex(),
}: NeighborhoodPanelProps) {
  const refs = index.referencedBy(nodeId);

  return (
    <Box mt="4">
      <Text
        size="1"
        color="gray"
        weight="medium"
        style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        Referenced by ({refs.length})
      </Text>
      {refs.length === 0 ? (
        <Text size="2" color="gray" as="p" mt="1">
          Nothing references this yet.
        </Text>
      ) : (
        groupByEdgeType(refs).map(([edgeType, items]) => (
          <Box key={edgeType} mt="2">
            <Text size="1" color="gray">
              {labelFor(edgeType)}
            </Text>
            <Flex direction="column" gap="1" mt="1">
              {items.map((n) => (
                <Text key={`${edgeType}:${n.id}`} size="2">
                  {n.node?.title ?? "Untitled topic"}
                  {n.note ? (
                    <Text color="gray" size="1">
                      {" "}
                      — {n.note}
                    </Text>
                  ) : null}
                </Text>
              ))}
            </Flex>
          </Box>
        ))
      )}
    </Box>
  );
}

function groupByEdgeType(refs: Neighbor[]): Array<[string, Neighbor[]]> {
  const groups = new Map<string, Neighbor[]>();
  for (const r of refs) {
    const g = groups.get(r.edgeType) ?? [];
    g.push(r);
    groups.set(r.edgeType, g);
  }
  return [...groups.entries()];
}
