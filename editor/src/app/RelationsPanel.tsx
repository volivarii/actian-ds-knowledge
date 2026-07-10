// The unified relations surface (spec 2026-07-10): outline with count
// pills on top, contextual relations below (Incoming snippets, Outgoing
// with the manage affordance, Graph neighbors with type badges). Mode
// agnostic: parents supply navigation and file-open callbacks, so the
// same component serves CodeMirror source mode, Milkdown rich mode, and
// the frontmatter-form body view.
import React, { useMemo, useState } from "react";
import { Badge, Box, Button, Flex, Text } from "@radix-ui/themes";
import { scanHeadings, type Heading } from "../lib/headingScan";
import type { IncomingRef, Neighbor } from "../lib/referenceIndex";
import type { OutgoingConnection } from "../substrate/refGraph";
import { computeFocusedSection } from "./SectionFocusTracker";

export interface RelationsPanelProps {
  text: string;
  file: string;
  /** section anchor -> incoming/outgoing count (outline pill). */
  counts: Map<string, number>;
  incoming: IncomingRef[];
  outgoing: OutgoingConnection[];
  graphNeighbors: Neighbor[];
  /** Scroll the editor to this heading. Mode-specific: CM6 line scroll in
   *  source mode, DOM heading scroll in rich mode. */
  onNavigate: (heading: Heading) => void;
  /** Open a file in the editor (incoming/graph row click-through). */
  onOpenFile: (path: string) => void;
  /** Open the connections manager (existing ConnectionsPopover flow) for
   *  a section, anchored to the given element. Write-back stays intact. */
  onManageConnections: (sectionAnchor: string, anchorEl: HTMLElement) => void;
}

const COLLAPSE_STORAGE_KEY = "relationsPanelCollapsed";

/** Anchor slug for a heading, resolved through the same section walker the
 *  counts use, so outline pills and scoping agree with countsBySection. */
function anchorForHeading(text: string, h: Heading): string | null {
  const s = computeFocusedSection(text, h.line);
  return s?.anchor ?? null;
}

export function RelationsPanel(props: RelationsPanelProps) {
  const headings = useMemo(() => scanHeadings(props.text), [props.text]);
  const [scopedAnchor, setScopedAnchor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable: state still toggles for the session */
      }
      return !c;
    });
  };

  const visibleIncoming = scopedAnchor
    ? props.incoming.filter((r) => r.slug === scopedAnchor)
    : props.incoming;

  return (
    <Flex
      direction="column"
      gap="2"
      p="2"
      style={{ height: "100%", overflow: "auto" }}
    >
      <Flex align="center" justify="between">
        <Text size="1" weight="bold" color="gray">
          Relations
        </Text>
        <Button
          size="1"
          variant="ghost"
          aria-label="Toggle relations panel"
          onClick={toggleCollapsed}
        >
          {collapsed ? "«" : "»"}
        </Button>
      </Flex>

      {!collapsed && (
        <>
          <Text size="1" weight="bold" color="gray">
            Outline
          </Text>
          <Box>
            {headings.map((h, i) => {
              const anchor = anchorForHeading(props.text, h);
              const count = anchor ? (props.counts.get(anchor) ?? 0) : 0;
              const scoped = anchor !== null && anchor === scopedAnchor;
              return (
                <Flex
                  key={`${h.line}:${i}`}
                  data-testid="outline-row"
                  align="center"
                  justify="between"
                  px="1"
                  style={{
                    cursor: "pointer",
                    borderRadius: 4,
                    background: scoped ? "var(--accent-3)" : undefined,
                    paddingLeft: (h.level - 1) * 10,
                  }}
                  onClick={() => {
                    props.onNavigate(h);
                    setScopedAnchor(scoped ? null : anchor);
                  }}
                >
                  <Text size="1" truncate>
                    {h.text}
                  </Text>
                  {count > 0 && (
                    <Badge size="1" variant="soft">
                      {count}
                    </Badge>
                  )}
                </Flex>
              );
            })}
          </Box>

          <Flex align="center" justify="between" mt="2">
            <Text size="1" weight="bold" color="gray">
              Relations{scopedAnchor ? `: ${scopedAnchor}` : ""}
            </Text>
            {scopedAnchor && (
              <Button
                size="1"
                variant="ghost"
                onClick={() => setScopedAnchor(null)}
              >
                All
              </Button>
            )}
          </Flex>

          <Text size="1" color="gray">
            Incoming ({visibleIncoming.length})
          </Text>
          {visibleIncoming.map((r, i) => (
            <Box
              key={`${r.fromPath}:${i}`}
              data-testid="incoming-row"
              px="1"
              style={{
                cursor: "pointer",
                borderLeft: "2px solid var(--gray-5)",
              }}
              onClick={() => props.onOpenFile(r.fromPath)}
            >
              {r.snippet && (
                <Text as="div" size="1">
                  {r.snippet}
                </Text>
              )}
              <Text as="div" size="1" color="gray" truncate>
                {r.fromPath}
              </Text>
            </Box>
          ))}

          <Flex align="center" justify="between">
            <Text size="1" color="gray">
              Outgoing ({props.outgoing.length})
            </Text>
            <Button
              size="1"
              variant="ghost"
              data-testid="manage-connections"
              onClick={(e) => {
                const anchor =
                  scopedAnchor ??
                  (headings[0]
                    ? anchorForHeading(props.text, headings[0])
                    : null);
                if (anchor) props.onManageConnections(anchor, e.currentTarget);
              }}
            >
              Manage
            </Button>
          </Flex>
          {props.outgoing.map((c, i) => (
            <Box key={`${c.refType}:${c.slug}:${i}`} px="1">
              <Text as="div" size="1" truncate>
                <Badge
                  size="1"
                  variant="outline"
                  color={c.domain ? undefined : "red"}
                >
                  {c.domain ?? "broken"}
                </Badge>{" "}
                {c.slug}
              </Text>
            </Box>
          ))}

          <Text size="1" color="gray" mt="1">
            Graph (as of last merge)
          </Text>
          {props.graphNeighbors.map((n, i) => (
            <Flex key={`${n.id}:${i}`} gap="1" align="center" px="1">
              <Badge size="1" variant="soft">
                {n.edgeType}
              </Badge>
              <Text size="1">{n.direction === "in" ? "←" : "→"}</Text>
              <Text size="1" truncate>
                {n.node?.title ?? n.id}
              </Text>
            </Flex>
          ))}
        </>
      )}
    </Flex>
  );
}
