// Build-once, browser-safe typed index over the baked knowledge graph
// (graph/dist/graph.json) edges. Forward + reverse adjacency with O(1)/O(deg)
// queries — the editor's first consumer of graph EDGES (nodes were already read
// via taxonomyAssets). UI (NeighborhoodPanel) + live-overlay land in PR3b.
//
// Browser-safe: imports ONLY the static JSON via taxonomyAssets — never node:fs.
import {
  graphNodes,
  graphEdges,
  type GraphNodeRaw,
  type GraphEdgeRaw,
} from "./taxonomyAssets";

export interface GraphInput {
  nodes: GraphNodeRaw[];
  edges: GraphEdgeRaw[];
}

export interface Neighbor {
  /** The neighbor node's id (the OTHER end of the edge). */
  id: string;
  /** Resolved neighbor node, or null if the edge points to an unknown id. */
  node: GraphNodeRaw | null;
  edgeType: string;
  note: string | null;
  direction: "out" | "in";
}

export interface NeighborOpts {
  edgeTypes?: string[];
  direction?: "out" | "in" | "both";
}

export interface GraphIndex {
  node(id: string): GraphNodeRaw | null;
  neighbors(id: string, opts?: NeighborOpts): Neighbor[];
  /** Typed reverse edges — who points AT this node. = neighbors(id, {direction:"in"}). */
  referencedBy(id: string, opts?: { edgeTypes?: string[] }): Neighbor[];
  degIn(id: string): number;
  degOut(id: string): number;
  orphans(): string[];
}

export function buildGraphIndex(input: GraphInput): GraphIndex {
  const nodeById = new Map<string, GraphNodeRaw>();
  for (const n of input.nodes) nodeById.set(n.id, n);

  const outAdj = new Map<string, GraphEdgeRaw[]>();
  const inAdj = new Map<string, GraphEdgeRaw[]>();
  for (const e of input.edges) {
    let o = outAdj.get(e.source);
    if (!o) outAdj.set(e.source, (o = []));
    o.push(e);
    let i = inAdj.get(e.target);
    if (!i) inAdj.set(e.target, (i = []));
    i.push(e);
  }

  const matches = (t: string, types?: string[]) => !types || types.includes(t);

  function toNeighbor(e: GraphEdgeRaw, direction: "out" | "in"): Neighbor {
    const otherId = direction === "out" ? e.target : e.source;
    return {
      id: otherId,
      node: nodeById.get(otherId) ?? null,
      edgeType: e.type,
      note: e.note ?? null,
      direction,
    };
  }

  function neighbors(id: string, opts: NeighborOpts = {}): Neighbor[] {
    const direction = opts.direction ?? "out";
    const result: Neighbor[] = [];
    if (direction === "out" || direction === "both") {
      for (const e of outAdj.get(id) ?? [])
        if (matches(e.type, opts.edgeTypes)) result.push(toNeighbor(e, "out"));
    }
    if (direction === "in" || direction === "both") {
      for (const e of inAdj.get(id) ?? [])
        if (matches(e.type, opts.edgeTypes)) result.push(toNeighbor(e, "in"));
    }
    return result;
  }

  const orphanList = input.nodes
    .filter((n) => !(outAdj.has(n.id) || inAdj.has(n.id)))
    .map((n) => n.id);

  return {
    node: (id) => nodeById.get(id) ?? null,
    neighbors,
    referencedBy: (id, opts = {}) =>
      neighbors(id, { direction: "in", edgeTypes: opts.edgeTypes }),
    degOut: (id) => outAdj.get(id)?.length ?? 0,
    degIn: (id) => inAdj.get(id)?.length ?? 0,
    orphans: () => [...orphanList],
  };
}

let _baked: GraphIndex | null = null;
/** Memoized index over the build-time-baked graph. */
export function bakedGraphIndex(): GraphIndex {
  return (_baked ??= buildGraphIndex({ nodes: graphNodes, edges: graphEdges }));
}
