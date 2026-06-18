// src/substrate/graphEligibility.ts
// Single source of truth for the "visual asset, not a relationship-bearing
// DS entity" exclusion. Icons (235 degree-1 leaves), product logos,
// illustrations, local + white-label components carry no useful edges; they
// drown the graph explorer and the hub/orphan tables. Same policy as
// coverageLoader's SKIP_REGISTRY_CATEGORIES — exported here in both the
// category-SLUG representation (the graph uses `category:<slug>` ids) and the
// registry-LABEL representation (DS Kit registry categories are human labels).
// Browser-safe: only the baked JSON via taxonomyAssets; never node:fs.
import {
  graphNodes,
  graphEdges,
  type GraphNodeRaw,
  type GraphEdgeRaw,
} from "./taxonomyAssets";
import { buildGraphIndex, type GraphIndex } from "./graphIndex";

export const EXCLUDED_CATEGORY_SLUGS: ReadonlySet<string> = new Set([
  "icons",
  "product-logos",
  "illustrations-graphics",
  "local-components",
  "white-label-services",
]);

export const EXCLUDED_CATEGORY_LABELS: ReadonlySet<string> = new Set([
  "Icons",
  "Product logos",
  "Illustrations & graphics",
  "Local components",
  "White-label services",
  "uncategorized",
]);

export interface GraphSubset {
  nodes: GraphNodeRaw[];
  edges: GraphEdgeRaw[];
}

function slugOf(nodeId: string): string {
  const i = nodeId.indexOf(":");
  return i < 0 ? nodeId : nodeId.slice(i + 1);
}

/** Ids to drop: the excluded category nodes + every component that sits in one
 *  (via an in_category edge). */
export function excludedNodeIds(
  nodes: GraphNodeRaw[],
  edges: GraphEdgeRaw[],
): Set<string> {
  const excludedCategories = new Set(
    nodes
      .filter(
        (n) => n.type === "category" && EXCLUDED_CATEGORY_SLUGS.has(slugOf(n.id)),
      )
      .map((n) => n.id),
  );
  const drop = new Set<string>(excludedCategories);
  for (const e of edges) {
    if (e.type === "in_category" && excludedCategories.has(e.target)) {
      drop.add(e.source);
    }
  }
  return drop;
}

/** The baked graph minus asset nodes and any edge touching them. */
export function eligibleSubset(
  nodes: GraphNodeRaw[] = graphNodes,
  edges: GraphEdgeRaw[] = graphEdges,
): GraphSubset {
  const drop = excludedNodeIds(nodes, edges);
  return {
    nodes: nodes.filter((n) => !drop.has(n.id)),
    edges: edges.filter((e) => !drop.has(e.source) && !drop.has(e.target)),
  };
}

let _eligible: GraphIndex | null = null;
/** Memoized typed index over the baked, asset-free subgraph. */
export function eligibleGraphIndex(): GraphIndex {
  return (_eligible ??= buildGraphIndex(eligibleSubset()));
}
