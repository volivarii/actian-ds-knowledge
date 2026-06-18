// Pure, deterministic radial layout of a focus node's k-hop neighborhood.
// Focus at center; hop-h neighbors evenly spaced on ring h (id-sorted for
// stability), first node at 12 o'clock. No physics, no random, integer coords
// → snapshot-stable. Designed for the depth-bounded explorer (tens of nodes),
// NOT the whole graph. Browser-safe (pure trig; no imports beyond graphIndex
// types).
import type { GraphIndex, Neighbor } from "./graphIndex";

export interface PlacedNode {
  id: string;
  title: string;
  type: string;
  x: number;
  y: number;
  hop: number;
  degree: number;
  isFocus: boolean;
}

export interface PlacedEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Layout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

export interface LayoutOpts {
  depth?: number;
  width?: number;
  height?: number;
  edgeTypes?: string[];
}

export function layoutNeighborhood(
  focusId: string,
  index: GraphIndex,
  opts: LayoutOpts = {},
): Layout {
  const depth = opts.depth ?? 1;
  const width = opts.width ?? 640;
  const height = opts.height ?? 480;
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const ringGap = Math.round(Math.min(width, height) / 2 / (depth + 1));

  // BFS by hop (both directions), id-sorted within each frontier for stability.
  const hopOf = new Map<string, number>();
  hopOf.set(focusId, 0);
  let frontier = [focusId];
  for (let h = 1; h <= depth; h++) {
    const nextSet = new Set<string>();
    for (const id of frontier) {
      const ns = index.neighbors(id, {
        direction: "both",
        edgeTypes: opts.edgeTypes,
      });
      for (const n of ns) if (!hopOf.has(n.id)) nextSet.add(n.id);
    }
    const next = [...nextSet].sort();
    for (const id of next) hopOf.set(id, h);
    frontier = next;
  }

  // Place nodes.
  const placed = new Map<string, PlacedNode>();
  const byHop = new Map<number, string[]>();
  for (const [id, hop] of hopOf) {
    const arr = byHop.get(hop) ?? [];
    arr.push(id);
    byHop.set(hop, arr);
  }
  for (const [hop, ids] of byHop) ids.sort();
  for (const [hop, ids] of byHop) {
    if (hop === 0) {
      const node = index.node(focusId);
      placed.set(focusId, {
        id: focusId,
        title: node?.title ?? "Untitled topic",
        type: node?.type ?? "unknown",
        x: cx,
        y: cy,
        hop: 0,
        degree: index.degIn(focusId) + index.degOut(focusId),
        isFocus: true,
      });
      continue;
    }
    const r = ringGap * hop;
    ids.forEach((id, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
      const node = index.node(id);
      placed.set(id, {
        id,
        title: node?.title ?? "Untitled topic",
        type: node?.type ?? "unknown",
        x: Math.round(cx + r * Math.cos(angle)),
        y: Math.round(cy + r * Math.sin(angle)),
        hop,
        degree: index.degIn(id) + index.degOut(id),
        isFocus: false,
      });
    });
  }

  // Collect edges among placed nodes (deduped by type|source|target).
  const seen = new Set<string>();
  const edges: PlacedEdge[] = [];
  for (const id of placed.keys()) {
    const out: Neighbor[] = index.neighbors(id, {
      direction: "out",
      edgeTypes: opts.edgeTypes,
    });
    for (const n of out) {
      if (!placed.has(n.id)) continue;
      const key = `${n.edgeType}|${id}|${n.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const s = placed.get(id)!;
      const t = placed.get(n.id)!;
      edges.push({
        id: key,
        source: id,
        target: n.id,
        type: n.edgeType,
        x1: s.x,
        y1: s.y,
        x2: t.x,
        y2: t.y,
      });
    }
  }

  return { nodes: [...placed.values()], edges, width, height };
}
