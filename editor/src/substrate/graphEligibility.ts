// src/substrate/graphEligibility.ts
// Single source of truth for the "visual asset, not a relationship-bearing
// DS entity" exclusion. Two rules are applied:
//
//   1. Category-based: Icons, product logos, illustrations, local components,
//      and white-label services — and every component wired to them via an
//      `in_category` edge — are excluded. Same policy as the DS Kit registry
//      filter (EXCLUDED_CATEGORY_LABELS, shared by coverageLoader).
//
//   2. Degree-0 component nodes: component nodes that have zero edges (they
//      appear as neither source nor target of any edge) are excluded. This
//      catches unclassified/unwired asset components — e.g. the ~292 Heroicon
//      nodes (`academic-cap`, `bell`, …) that exist in the graph JSON but are
//      not wired to any category or relationship. Real unwired DS components
//      (if any) are surfaced by the Coverage tab, not the Relationships tab.
//
// Together these rules prevent asset-set noise from flooding the orphan table
// and the title search. The exported constants are the registry-LABEL
// representation; EXCLUDED_CATEGORY_SLUGS is the graph `category:<slug>` form.
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

/** Ids to drop:
 *  1. The excluded category nodes + every component wired to them via
 *     `in_category` (category-based rule).
 *  2. Every `component` node that is completely disconnected (degree-0 —
 *     appears as neither source nor target of any edge). These are
 *     unclassified/unwired asset components (e.g. the Heroicon set) that
 *     carry no relationship information; real unwired DS components are
 *     surfaced by the Coverage tab instead.
 */
export function excludedNodeIds(
  nodes: GraphNodeRaw[],
  edges: GraphEdgeRaw[],
): Set<string> {
  // Rule 1: category-based exclusions
  const excludedCategories = new Set(
    nodes
      .filter(
        (n) =>
          n.type === "category" && EXCLUDED_CATEGORY_SLUGS.has(slugOf(n.id)),
      )
      .map((n) => n.id),
  );
  const drop = new Set<string>(excludedCategories);
  for (const e of edges) {
    if (e.type === "in_category" && excludedCategories.has(e.target)) {
      drop.add(e.source);
    }
  }

  // Rule 2: degree-0 component nodes (no edges at all)
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  for (const n of nodes) {
    if (n.type === "component" && !connected.has(n.id)) {
      drop.add(n.id);
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
