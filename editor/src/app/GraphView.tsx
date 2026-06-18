// src/app/GraphView.tsx
// Presentational SVG renderer for a focus-node neighborhood Layout. Plain SVG
// (no canvas/WebGL) → DOM-queryable, ARIA-able, Radix-themeable, jsdom-
// testable. Node color is by type but NEVER the sole channel: the type is in
// every node's aria-label and the legend. Clicking a node re-roots (explore);
// "open in editor" lives in the tab's node card (separate explore/open).
import React, { useMemo, useState } from "react";
import { Badge, Box, Flex } from "@radix-ui/themes";
import type { Layout, PlacedNode } from "../substrate/neighborhoodLayout";

export const NODE_TYPE_COLOR: Record<string, string> = {
  component: "var(--indigo-9)",
  category: "var(--gray-8)",
  a11y_criterion: "var(--grass-9)",
  foundation_section: "var(--amber-9)",
  motion_pattern: "var(--purple-9)",
  content_topic: "var(--cyan-9)",
  unknown: "var(--gray-6)",
};

export const NODE_TYPE_LABEL: Record<string, string> = {
  component: "Component",
  category: "Category",
  a11y_criterion: "Accessibility criterion",
  foundation_section: "Foundation",
  motion_pattern: "Motion pattern",
  content_topic: "Content topic",
  unknown: "Node",
};

function typeColor(t: string): string {
  return NODE_TYPE_COLOR[t] ?? NODE_TYPE_COLOR.unknown!;
}
function typeLabel(t: string): string {
  return NODE_TYPE_LABEL[t] ?? NODE_TYPE_LABEL.unknown!;
}

export interface GraphViewProps {
  layout: Layout;
  onFocusNode?: (id: string) => void;
}

export function GraphView({ layout, onFocusNode }: GraphViewProps) {
  const presentTypes = useMemo(
    () => [...new Set(layout.nodes.map((n) => n.type))].sort(),
    [layout],
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visibleNodes = layout.nodes.filter((n) => !hidden.has(n.type));
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = layout.edges.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  );

  function toggle(type: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const focusTitle = layout.nodes.find((n) => n.isFocus)?.title ?? "node";

  return (
    <Box>
      {/* Legend = filter. Color + label, so color is not the sole channel. */}
      <Flex
        gap="2"
        wrap="wrap"
        mb="2"
        role="group"
        aria-label="Filter by node type"
      >
        {presentTypes.map((t) => {
          const off = hidden.has(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={!off}
              aria-label={`Toggle ${typeLabel(t)}`}
              onClick={() => toggle(t)}
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
        {visibleNodes.map((n) => (
          <GraphNode key={n.id} node={n} onFocusNode={onFocusNode} />
        ))}
      </svg>
    </Box>
  );
}

function GraphNode({
  node,
  onFocusNode,
}: {
  node: PlacedNode;
  onFocusNode?: (id: string) => void;
}) {
  const r = node.isFocus ? 10 : 7;
  const activate = () => onFocusNode?.(node.id);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${node.title}, ${typeLabel(node.type)}, ${node.degree} connections`}
      style={{ cursor: onFocusNode ? "pointer" : "default" }}
      onClick={activate}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          activate();
        }
      }}
    >
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
        {node.title}
      </text>
    </g>
  );
}
