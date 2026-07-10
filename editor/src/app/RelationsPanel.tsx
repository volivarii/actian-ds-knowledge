// The unified relations surface (spec 2026-07-10): outline with count
// pills on top, contextual relations below (Incoming snippets, Outgoing
// with the manage affordance, Graph neighbors with type badges). Mode
// agnostic: parents supply navigation and file-open callbacks, so the
// same component serves CodeMirror source mode, Milkdown rich mode, and
// the frontmatter-form body view.
import React, { useMemo, useState } from "react";
import { Badge, Box, Button, Flex, Text } from "@radix-ui/themes";
import type { Heading } from "../lib/headingScan";
import {
  sectionAnchors,
  type IncomingRef,
  type Neighbor,
} from "../lib/referenceIndex";
import type { OutgoingConnection } from "../substrate/refGraph";
import { navTargetForNodeId } from "../substrate/navTargetForNodeId";

export interface RelationsPanelProps {
  text: string;
  file: string;
  /** section anchor -> incoming/outgoing count (outline pill). */
  counts: Map<string, number>;
  incoming: IncomingRef[];
  outgoing: OutgoingConnection[];
  graphNeighbors: Neighbor[];
  /** Scroll the editor to this heading, at its index among the outline's
   *  H1-H3 headings (index-based so duplicate heading text and inline
   *  markdown in a heading don't break navigation). Mode-specific: CM6 line
   *  scroll in source mode, DOM heading scroll (by index) in rich mode. */
  onNavigate: (heading: Heading, index: number) => void;
  /** Open a file in the editor (incoming/graph row click-through). */
  onOpenFile: (path: string) => void;
  /** Open the connections manager (existing ConnectionsPopover flow) for
   *  a section, anchored to the given element. Write-back stays intact.
   *  Optional: a caller with no manage flow wired up yet (e.g. the
   *  frontmatter-form body view) omits it and the Manage button does not
   *  render, rather than rendering enabled with a no-op click. */
  onManageConnections?: (sectionAnchor: string, anchorEl: HTMLElement) => void;
  /** Collapsed state is owned by the parent screen (MarkdownEditScreen /
   *  FrontmatterBodyEditScreen) so it can gate the expensive incoming/counts
   *  props (`collapsed ? [] : incomingForFile(...)`) rather than compute
   *  them every keystroke only to hide the DOM that would show them. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const COLLAPSE_STORAGE_KEY = "relationsPanelCollapsed";

/** Read the persisted collapsed preference. Owned here (not by the panel's
 *  own state) so the parents that now own `collapsed` can seed their
 *  initial state from the same key the toggle writes to. */
export function readRelationsPanelCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the collapsed preference. Failures (e.g. private-mode storage)
 *  are swallowed: the caller's in-memory state still toggles for the
 *  session. */
export function writeRelationsPanelCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* storage unavailable: state still toggles for the session */
  }
}

/** Wraps a click-equivalent action into a keydown handler so a clickable
 *  div (role="button") also responds to Enter and Space, matching native
 *  button semantics. */
function onActivateKey(action: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };
}

export function RelationsPanel(props: RelationsPanelProps) {
  const { collapsed, onToggleCollapsed } = props;
  // One scanHeadings(text) pass (FIX 1): each entry carries its own
  // resolved anchor, so neither the outline rows nor the Manage fallback
  // re-run computeFocusedSection per heading per render.
  const entries = useMemo(() => sectionAnchors(props.text), [props.text]);
  const [scopedAnchor, setScopedAnchor] = useState<string | null>(null);

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
          onClick={onToggleCollapsed}
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
            {entries.map(({ heading: h, anchor }, i) => {
              const count = anchor ? (props.counts.get(anchor) ?? 0) : 0;
              const scoped = anchor !== null && anchor === scopedAnchor;
              // H1 rows (and any heading before the first H2/H3) have no
              // anchor to scope to: navigate only, leave scopedAnchor as
              // it is instead of clearing an active scope.
              const activate = () => {
                props.onNavigate(h, i);
                if (anchor !== null) setScopedAnchor(scoped ? null : anchor);
              };
              return (
                <Flex
                  key={`${h.line}:${i}`}
                  data-testid="outline-row"
                  role="button"
                  tabIndex={0}
                  align="center"
                  justify="between"
                  px="1"
                  style={{
                    cursor: "pointer",
                    borderRadius: 4,
                    background: scoped ? "var(--accent-3)" : undefined,
                    paddingLeft: (h.level - 1) * 10,
                  }}
                  onClick={activate}
                  onKeyDown={onActivateKey(activate)}
                >
                  <Text size="1" truncate>
                    {h.text}
                  </Text>
                  {count > 0 && (
                    <Badge size="1" variant="soft" data-testid="outline-count">
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
              role="button"
              tabIndex={0}
              px="1"
              style={{
                cursor: "pointer",
                borderLeft: "2px solid var(--gray-5)",
              }}
              onClick={() => props.onOpenFile(r.fromPath)}
              onKeyDown={onActivateKey(() => props.onOpenFile(r.fromPath))}
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
            {props.onManageConnections && (
              <Button
                size="1"
                variant="ghost"
                data-testid="manage-connections"
                onClick={(e) => {
                  const anchor =
                    scopedAnchor ??
                    entries.find((s) => s.anchor !== null)?.anchor ??
                    null;
                  if (anchor)
                    props.onManageConnections!(anchor, e.currentTarget);
                }}
              >
                Manage
              </Button>
            )}
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
          {props.graphNeighbors.map((n, i) => {
            // navTargetForNodeId is the same node-id -> activePath mapping
            // NeighborhoodPanel already uses. Not every node type
            // round-trips to an editable path (content, motion): those
            // rows stay plain, non-interactive.
            const target = navTargetForNodeId(n.id);
            const row = (
              <Flex gap="1" align="center" px="1">
                <Badge size="1" variant="soft">
                  {n.edgeType.replace(/_/g, " ")}
                </Badge>
                <Text size="1">{n.direction === "in" ? "←" : "→"}</Text>
                <Text size="1" truncate>
                  {n.node?.title ?? n.id}
                </Text>
              </Flex>
            );
            if (target === null) {
              return (
                <Box key={`${n.id}:${i}`} data-testid="graph-row">
                  {row}
                </Box>
              );
            }
            const activate = () => props.onOpenFile(target);
            return (
              <Box
                key={`${n.id}:${i}`}
                data-testid="graph-row"
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
                onClick={activate}
                onKeyDown={onActivateKey(activate)}
              >
                {row}
              </Box>
            );
          })}
        </>
      )}
    </Flex>
  );
}
