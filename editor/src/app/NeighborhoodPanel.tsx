// Typed "Referenced by" view: who points AT the current node, read from the
// baked knowledge graph (graphIndex.referencedBy) — replacing the markdown-
// anchor fake (which showed raw file paths). Grouped by relationship with
// HUMAN labels; shows neighbor TITLES (never ids/slugs) per the vocabulary
// doctrine guard. Resolvable referrers are clickable (onNavigate); large
// groups are capped and expandable.
import React, { useState } from "react";
import { Box, Button, Flex, Link, Text } from "@radix-ui/themes";
import {
  bakedGraphIndex,
  type GraphIndex,
  type Neighbor,
} from "../substrate/graphIndex";
import { navTargetForNodeId } from "../substrate/navTargetForNodeId";
import { relationGroupLabel, rankedLabels } from "../lib/relationGroups";

// The word for an INCOMING edge. Delegates to the nomenclature rather than
// keeping a fourth copy of the relation vocabulary: this map used to say
// "Cited as an accessibility requirement by" where the relations rail said
// "Accessibility for" and the graph tab said `a11y_ref`, all for one edge.
function labelFor(edgeType: string): string {
  return relationGroupLabel(edgeType, "in");
}

/** Rows shown per group before "Show all". Tuned so only true hubs
 *  (category:icons=235, data-display=31) get an expander; every other
 *  group (<=11 incoming) renders in full. */
const GROUP_CAP = 8;

export interface NeighborhoodPanelProps {
  nodeId: string;
  index?: GraphIndex;
  /** When provided, resolvable referrers become clickable and open their
   *  file/workspace. Omitted → titles are read-only. */
  onNavigate?: (path: string) => void;
}

export function NeighborhoodPanel({
  nodeId,
  index = bakedGraphIndex(),
  onNavigate,
}: NeighborhoodPanelProps) {
  const refs = index.referencedBy(nodeId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
        groupByRelationship(refs).map(([label, items]) => {
          const isOpen = expanded.has(label);
          const shown = isOpen ? items : items.slice(0, GROUP_CAP);
          return (
            <Box key={label} mt="2">
              <Text size="1" color="gray">
                {label}
              </Text>
              <Flex direction="column" gap="1" mt="1" align="start">
                {shown.map((n) => (
                  <NeighborTitle
                    key={`${label}:${n.id}`}
                    neighbor={n}
                    onNavigate={onNavigate}
                  />
                ))}
                {items.length > GROUP_CAP ? (
                  <Button
                    size="1"
                    variant="ghost"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(label)) next.delete(label);
                        else next.add(label);
                        return next;
                      })
                    }
                  >
                    {isOpen ? "Show fewer" : `Show all (${items.length})`}
                  </Button>
                ) : null}
              </Flex>
            </Box>
          );
        })
      )}
    </Box>
  );
}

function NeighborTitle({
  neighbor,
  onNavigate,
}: {
  neighbor: Neighbor;
  onNavigate?: (path: string) => void;
}) {
  const title = neighbor.node?.title ?? "Untitled topic";
  const target = navTargetForNodeId(neighbor.id);
  const note = neighbor.note ? (
    <Text color="gray" size="1">
      {" "}
      — {neighbor.note}
    </Text>
  ) : null;

  if (onNavigate && target) {
    return (
      <Text size="2">
        <Link asChild>
          <button
            type="button"
            onClick={() => onNavigate(target)}
            style={{
              background: "none",
              border: 0,
              padding: 0,
              font: "inherit",
              color: "inherit",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {title}
          </button>
        </Link>
        {note}
      </Text>
    );
  }
  return (
    <Text size="2">
      {title}
      {note}
    </Text>
  );
}

/**
 * Buckets by the WORD, not by the edge type.
 *
 * The vocabulary collapsed several edge types onto one word — `composed_of`
 * and `uses_component` are both "Used in" inbound — so grouping by edge type
 * rendered two separate sections carrying the identical heading, each with its
 * own "Show all". A component like Button has both, and 20 nodes in the current
 * graph do. `relationGroups.groupGraphNeighbors` already buckets by label; this
 * panel was pointed at the new vocabulary without being given the same merge.
 */
function groupByRelationship(refs: Neighbor[]): Array<[string, Neighbor[]]> {
  const groups = new Map<string, Neighbor[]>();
  for (const r of refs) {
    const label = labelFor(r.edgeType);
    const g = groups.get(label) ?? [];
    g.push(r);
    groups.set(label, g);
  }
  // Ranked like the relations rail, not left in Map insertion order. Insertion
  // order is whatever the graph index happened to emit, so the same seven words
  // rendered in a different sequence on the two surfaces — and shifted between
  // nodes with the same families.
  const rank = (label: string) => {
    const i = rankedLabels().indexOf(label);
    return i === -1 ? rankedLabels().length : i;
  };
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
}
