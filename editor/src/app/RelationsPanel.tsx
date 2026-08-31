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
import {
  navTargetForConnection,
  navTargetForNodeId,
} from "../substrate/navTargetForNodeId";
import { relationTypeColor } from "../lib/relationTypes";
import { groupGraphNeighbors } from "../lib/relationGroups";
import { GraphView } from "./GraphView";
import type { Layout } from "../substrate/neighborhoodLayout";
import { slugOfNodeId } from "../substrate/nodeSlug";
import { onActivateKey } from "../lib/onActivateKey";

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
  /** Section anchor the editor is currently focused on (cursor-derived in the
   *  CodeMirror modes), highlighted in the outline as a passive follow marker.
   *  Distinct from the click-driven `scopedAnchor` filter: `activeAnchor` never
   *  scopes the Incoming list, it only shows the author where they are. Rich
   *  mode has no cursor callback yet, so it passes null (no active marker). */
  activeAnchor?: string | null;
  /** The current file's neighborhood, laid out for a compact map beside the
   *  note. When provided, the panel renders it; its nodes carry data-ref, so
   *  the map joins the cross-surface highlight. Optional: callers with no graph
   *  node for the file (or the frontmatter-form body view) omit it. */
  neighborhoodLayout?: Layout;
  /** Re-root/open a node from the map. */
  onFocusNode?: (id: string) => void;
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


/** Relation row that navigates (click/Enter/Space) when it has somewhere
 *  to go, and stays a plain box otherwise. The single owner of the
 *  interactive-row contract shared by incoming, outgoing, and graph rows. */
function NavRow(props: {
  target: string | null;
  onOpen: (target: string) => void;
  testid: string;
  /** Node type of the row's subject, surfaced as data-node-type so the row can
   *  carry a typed dot and join the cross-surface highlight. */
  nodeType?: string;
  /** Referenced slug, surfaced as data-ref so an inline link with the same
   *  slug highlights this row together (installCrossSurfaceHighlight). */
  refSlug?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { target } = props;
  if (target === null) {
    return (
      <Box
        data-testid={props.testid}
        data-node-type={props.nodeType}
        data-ref={props.refSlug}
        px="1"
        style={props.style}
      >
        {props.children}
      </Box>
    );
  }
  const activate = () => props.onOpen(target);
  return (
    <Box
      data-testid={props.testid}
      data-node-type={props.nodeType}
      data-ref={props.refSlug}
      role="button"
      tabIndex={0}
      px="1"
      style={{ cursor: "pointer", ...props.style }}
      onClick={activate}
      onKeyDown={onActivateKey(activate)}
    >
      {props.children}
    </Box>
  );
}

export function RelationsPanel(props: RelationsPanelProps) {
  const { collapsed, onToggleCollapsed } = props;
  // One scanHeadings(text) pass (FIX 1): each entry carries its own
  // resolved anchor, so neither the outline rows nor the Manage fallback
  // re-run computeFocusedSection per heading per render.
  const entries = useMemo(() => sectionAnchors(props.text), [props.text]);
  const graphGroups = useMemo(
    () => groupGraphNeighbors(props.graphNeighbors),
    [props.graphNeighbors],
  );
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
              const active =
                anchor !== null && anchor === (props.activeAnchor ?? null);
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
                  data-active={active ? "true" : undefined}
                  role="button"
                  tabIndex={0}
                  align="center"
                  justify="between"
                  px="1"
                  style={{
                    cursor: "pointer",
                    borderRadius: 4,
                    background: scoped ? "var(--accent-3)" : undefined,
                    // Passive cursor-follow marker: an accent left rule, with a
                    // transparent rule as the baseline so activating a row never
                    // shifts its text sideways.
                    borderLeft: active
                      ? "2px solid var(--accent-8)"
                      : "2px solid transparent",
                    fontWeight: active ? 600 : undefined,
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
            Referenced by ({visibleIncoming.length})
          </Text>
          {visibleIncoming.length === 0 && (
            <Text size="1" color="gray" data-testid="incoming-empty">
              {scopedAnchor
                ? "Nothing links to this section yet."
                : "Nothing links here yet."}
            </Text>
          )}
          {visibleIncoming.map((r, i) => (
            <NavRow
              key={`${r.fromPath}:${i}`}
              testid="incoming-row"
              target={r.fromPath}
              onOpen={props.onOpenFile}
              style={{ borderLeft: "2px solid var(--gray-5)" }}
            >
              {r.snippet && (
                <Text as="div" size="1">
                  {r.snippet}
                </Text>
              )}
              <Text as="div" size="1" color="gray" truncate>
                {r.fromPath}
              </Text>
            </NavRow>
          ))}

          <Flex align="center" justify="between">
            <Text size="1" color="gray">
              References ({props.outgoing.length})
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
          {props.outgoing.length === 0 && (
            <Text size="1" color="gray" data-testid="outgoing-empty">
              {props.onManageConnections
                ? "No references yet. Use Manage to add one."
                : "No references yet."}
            </Text>
          )}
          {props.outgoing.map((c, i) => (
            // Rows that resolve to an editable target navigate, matching
            // the incoming and graph rows; broken refs and domains without
            // a standalone file (motion, content) stay plain. Editing
            // stays in the Manage popover.
            <NavRow
              key={`${c.refType}:${c.slug}:${i}`}
              testid="outgoing-row"
              target={navTargetForConnection(c.domain, c.slug)}
              onOpen={props.onOpenFile}
            >
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
            </NavRow>
          ))}

          <Flex align="center" justify="between" mt="1">
            <Text size="1" weight="bold" color="gray">
              In the graph
            </Text>
            {/* Honest freshness: graph edges are baked at the last merge, not
                live like the anchor-derived Referenced-by list above. */}
            <Text size="1" color="gray">
              as of last merge
            </Text>
          </Flex>
          {props.graphNeighbors.length === 0 && (
            <Text size="1" color="gray" data-testid="graph-empty">
              No graph connections yet.
            </Text>
          )}
          {/* Grouped by human relationship (Appears in / Used in patterns /
              Contains / ...) instead of a flat list of raw edge-type badges.
              Each row carries a typed dot + its node type so a relationship
              reads by kind at a glance and can join the cross-surface
              highlight in a later slice. */}
          {graphGroups.map((group) => (
            <Box key={group.label} mt="1">
              <Text size="1" color="gray" data-testid="graph-group-label">
                {group.label}
              </Text>
              {group.items.map((n, i) => (
                // navTargetForNodeId is the same node-id -> activePath mapping
                // NeighborhoodPanel already uses. Not every node type
                // round-trips to an editable path (content, motion): those
                // rows stay plain, non-interactive.
                <NavRow
                  key={`${group.label}:${n.id}:${i}`}
                  testid="graph-row"
                  nodeType={n.node?.type ?? "unknown"}
                  refSlug={slugOfNodeId(n.id)}
                  target={navTargetForNodeId(n.id)}
                  onOpen={props.onOpenFile}
                >
                  <Flex gap="2" align="center">
                    <span
                      data-testid="reldot"
                      aria-hidden
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: relationTypeColor(
                          n.node?.type ?? "unknown",
                        ),
                        flex: "none",
                      }}
                    />
                    <Text size="1" truncate>
                      {n.node?.title ?? n.id}
                    </Text>
                  </Flex>
                </NavRow>
              ))}
            </Box>
          ))}

          {props.neighborhoodLayout && (
            <Box mt="3">
              <Text size="1" weight="bold" color="gray">
                Neighborhood
              </Text>
              <Box mt="1">
                {/* key on the file so the map remounts per file: its roving
                    tabindex resets to the focus node instead of carrying a
                    stale active index into the next file's map. */}
                <GraphView
                  key={props.file}
                  layout={props.neighborhoodLayout}
                  compact
                  onFocusNode={props.onFocusNode}
                />
              </Box>
            </Box>
          )}
        </>
      )}
    </Flex>
  );
}
