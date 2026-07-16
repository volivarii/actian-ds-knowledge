// src/app/GraphView.tsx
// Presentational SVG renderer for a focus-node neighborhood Layout. Plain SVG
// (no canvas/WebGL) → DOM-queryable, ARIA-able, Radix-themeable, jsdom-
// testable. Node color is by type but NEVER the sole channel: the type is in
// every node's accessible name and the legend. Clicking a node re-roots
// (explore); "open in editor" lives in the tab's node card (separate
// explore/open). Roving tabindex over visible nodes; arrow keys move focus.
import React, { useMemo, useState, useRef, useEffect } from "react";
import { Badge, Box, Button, Flex } from "@radix-ui/themes";
import type { Layout, PlacedNode } from "../substrate/neighborhoodLayout";
import {
  NODE_TYPE_COLOR,
  NODE_TYPE_LABEL,
  relationTypeColor,
  relationTypeLabel,
} from "../lib/relationTypes";
import { slugOfNodeId } from "../substrate/nodeSlug";

// Re-exported so existing importers (GraphHealthTab) keep resolving these from
// GraphView; the canonical definitions now live in the shared relationTypes
// module so the graph map, the relations rail, and inline chips share one
// typed-color language.
export { NODE_TYPE_COLOR, NODE_TYPE_LABEL };

const MAX_LABEL_LEN = 18;

export const EDGE_TYPE_LABEL: Record<string, string> = {
  a11y_ref: "Accessibility",
  foundations_ref: "Foundation",
  motion_ref: "Motion",
  related: "Related",
  in_category: "Category",
  narrower: "Narrower",
};

function typeColor(t: string): string {
  return relationTypeColor(t);
}
function typeLabel(t: string): string {
  return relationTypeLabel(t);
}
function edgeLabel(t: string): string {
  return EDGE_TYPE_LABEL[t] ?? "Related";
}

export interface GraphViewProps {
  layout: Layout;
  onFocusNode?: (id: string) => void;
  onReset?: () => void;
  /** Compact placements (the relations rail beside the note) hide the filter
   *  toolbar and render just the graph. */
  compact?: boolean;
}

export function GraphView({
  layout,
  onFocusNode,
  onReset,
  compact,
}: GraphViewProps) {
  // ── Node-type filter ────────────────────────────────────────────────────
  const presentTypes = useMemo(
    () => [...new Set(layout.nodes.map((n) => n.type))].sort(),
    [layout],
  );
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(
    new Set(),
  );

  // ── Edge-type filter ────────────────────────────────────────────────────
  const presentEdgeTypes = useMemo(
    () => [...new Set(layout.edges.map((e) => e.type))].sort(),
    [layout],
  );
  const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState<Set<string>>(
    new Set(),
  );

  // ── Visibility computation ───────────────────────────────────────────────
  // 1. Candidate edges: edge type not hidden AND both endpoints pass node-type filter.
  // 2. Visible nodes: passes node-type filter AND (is focus OR has a candidate edge).
  // 3. Visible edges: the candidate edges (endpoints are visible by construction).
  const { visibleNodes, visibleEdges } = useMemo(() => {
    const nodePassesTypeFilter = (n: PlacedNode) =>
      !hiddenNodeTypes.has(n.type);

    const typePassingIds = new Set(
      layout.nodes.filter(nodePassesTypeFilter).map((n) => n.id),
    );

    const candidateEdges = layout.edges.filter(
      (e) =>
        !hiddenEdgeTypes.has(e.type) &&
        typePassingIds.has(e.source) &&
        typePassingIds.has(e.target),
    );

    const connectedIds = new Set<string>();
    for (const e of candidateEdges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }

    const vNodes = layout.nodes.filter(
      (n) => nodePassesTypeFilter(n) && (n.isFocus || connectedIds.has(n.id)),
    );

    return { visibleNodes: vNodes, visibleEdges: candidateEdges };
  }, [layout, hiddenNodeTypes, hiddenEdgeTypes]);

  // ── Roving tabindex (Feature B) ──────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState(0);
  const nodeRefs = useRef<(SVGGElement | null)[]>([]);

  // Clamp activeIndex into [0, n-1] whenever visible node count changes.
  useEffect(() => {
    const n = visibleNodes.length;
    if (n === 0) return;
    setActiveIndex((prev) => Math.min(prev, n - 1));
  }, [visibleNodes.length]);

  // ── Toggle helpers ───────────────────────────────────────────────────────
  function toggleNodeType(type: string) {
    setHiddenNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleEdgeType(type: string) {
    setHiddenEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleReset() {
    setHiddenNodeTypes(new Set());
    setHiddenEdgeTypes(new Set());
    onReset?.();
  }

  // ── Arrow-key handler (lives here, drives roving focus) ──────────────────
  function handleNodeKeyDown(
    ev: React.KeyboardEvent<SVGGElement>,
    nodeIndex: number,
  ) {
    const n = visibleNodes.length;
    if (n === 0) return;
    let next: number | null = null;

    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
      ev.preventDefault();
      next = (nodeIndex + 1) % n;
    } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
      ev.preventDefault();
      next = (nodeIndex - 1 + n) % n;
    } else if (ev.key === "Home") {
      ev.preventDefault();
      next = 0;
    } else if (ev.key === "End") {
      ev.preventDefault();
      next = n - 1;
    } else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      onFocusNode?.(visibleNodes[nodeIndex]!.id);
      return;
    }

    if (next !== null) {
      setActiveIndex(next);
      // Imperatively focus the new active node's element.
      nodeRefs.current[next]?.focus();
    }
  }

  const focusTitle = layout.nodes.find((n) => n.isFocus)?.title ?? "node";

  // Keep the roving ref array in sync with the visible nodes: drop stale
  // entries when the visible set shrinks (e.g. after a filter toggle) so a
  // clamped activeIndex never points at a detached, unmounted element.
  nodeRefs.current.length = visibleNodes.length;

  return (
    <Box>
      {/* Legend = filter. Color + label, so color is not the sole channel.
          Hidden in compact placements (the rail map), which have no room. */}
      {!compact && (
        <Flex
          gap="2"
          wrap="wrap"
          mb="2"
          align="center"
          role="toolbar"
          aria-label="Graph view controls"
        >
          {/* Node-type toggles */}
          <Flex
            gap="2"
            wrap="wrap"
            align="center"
            role="group"
            aria-label="Filter by node type"
          >
            {presentTypes.map((t) => {
              const off = hiddenNodeTypes.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={!off}
                  aria-label={`Toggle ${typeLabel(t)}`}
                  onClick={() => toggleNodeType(t)}
                  style={{
                    background: "none",
                    border: 0,
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <Badge variant={off ? "outline" : "soft"} color="gray">
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: 8,
                        background: typeColor(t),
                        marginRight: 6,
                        opacity: off ? 0.3 : 1,
                      }}
                    />
                    {typeLabel(t)}
                  </Badge>
                </button>
              );
            })}
          </Flex>

          {/* Edge-type toggles */}
          {presentEdgeTypes.length > 0 && (
            <Flex
              gap="2"
              wrap="wrap"
              align="center"
              role="group"
              aria-label="Filter by relationship type"
            >
              {presentEdgeTypes.map((t) => {
                const off = hiddenEdgeTypes.has(t);
                const label = edgeLabel(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={!off}
                    aria-label={`Toggle ${label} relationships`}
                    onClick={() => toggleEdgeType(t)}
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <Badge variant={off ? "outline" : "soft"} color="gray">
                      {label}
                    </Badge>
                  </button>
                );
              })}
            </Flex>
          )}

          <Button
            size="1"
            variant="soft"
            aria-label="Reset graph view"
            onClick={handleReset}
          >
            Reset view
          </Button>
        </Flex>
      )}

      <svg
        width={layout.width}
        height={layout.height}
        role="group"
        aria-label={`Relationship graph centered on ${focusTitle}`}
        style={{
          maxWidth: "100%",
          height: "auto",
          border: "1px solid var(--gray-5)",
          borderRadius: 8,
        }}
      >
        {visibleEdges.map((e) => (
          <line
            key={e.id}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="var(--gray-6)"
            strokeWidth={1}
          />
        ))}
        {visibleNodes.map((n, i) => (
          <GraphNode
            key={n.id}
            node={n}
            tabIndex={i === activeIndex ? 0 : -1}
            onFocusNode={onFocusNode}
            onKeyDown={(ev) => handleNodeKeyDown(ev, i)}
            onClick={() => {
              setActiveIndex(i);
              onFocusNode?.(n.id);
            }}
            nodeRef={(el) => {
              nodeRefs.current[i] = el;
            }}
          />
        ))}
      </svg>
    </Box>
  );
}

function truncateLabel(title: string): string {
  if (title.length <= MAX_LABEL_LEN) return title;
  return title.slice(0, MAX_LABEL_LEN) + "…";
}

function GraphNode({
  node,
  tabIndex,
  onFocusNode,
  onKeyDown,
  onClick,
  nodeRef,
}: {
  node: PlacedNode;
  tabIndex: number;
  onFocusNode?: (id: string) => void;
  onKeyDown: (ev: React.KeyboardEvent<SVGGElement>) => void;
  onClick: () => void;
  nodeRef: (el: SVGGElement | null) => void;
}) {
  const r = node.isFocus ? 10 : 7;
  const visibleLabel = truncateLabel(node.title);
  return (
    <g
      ref={nodeRef}
      role="button"
      tabIndex={tabIndex}
      data-ref={slugOfNodeId(node.id)}
      aria-label={`${node.title}, ${typeLabel(node.type)}, ${node.degree} connections`}
      style={{ cursor: onFocusNode ? "pointer" : "default" }}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {/* SVG <title> provides hover tooltip with the full title */}
      <title>{node.title}</title>
      <circle
        cx={node.x}
        cy={node.y}
        r={r}
        fill={typeColor(node.type)}
        stroke={node.isFocus ? "var(--gray-12)" : "var(--color-background)"}
        strokeWidth={node.isFocus ? 2 : 1}
      />
      <text
        x={node.x}
        y={node.y + r + 12}
        textAnchor="middle"
        fontSize={11}
        fill="var(--gray-12)"
      >
        {visibleLabel}
      </text>
    </g>
  );
}
