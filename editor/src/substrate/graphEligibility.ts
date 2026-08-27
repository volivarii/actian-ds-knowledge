// src/substrate/graphEligibility.ts
// Single source of truth for the "visual asset, not a relationship-bearing
// DS entity" exclusion. Two rules are applied:
//
//   1. Category-based: Icons, product logos, illustrations, local components,
//      and white-label services — and every component wired to them via an
//      `in_category` edge — are excluded. Same policy as the DS Kit registry
//      filter (isRegistryComponent, shared by coverageLoader).
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
// representation. It stays label-based because graph component nodes carry no
// `section` field, so the registry rule below cannot reach them; that gap is
// the reason the two rules are not one.
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

// The registry's own answer to "is this a component", for the surfaces that read
// dskit.json rather than the graph.
//
// This replaced a hand-maintained set of excluded category LABELS, which is the
// wrong shape for the question: it named the categories that existed when it was
// written, Figma has added categories since, and a category the list does not
// name is silently eligible. By 2026-08-26 that had put 90 `Third-party logos`
// and the 5 `Breakpoint, grid & structure` sizes into the Coverage dashboard as
// components awaiting guidance, taking its denominator from 73 to 168 and
// understating every coverage percentage by more than half. It was also stale in
// a second way: it excluded "Local components", and that Figma page had become
// "Local components + templates".
//
// `section` is the field Figma already maintains, it is total (every dskit.json
// entry carries one), and its four values are Components / Foundations /
// Brand Assets / Other Resources. Icons and grids are Foundations; logos and
// illustrations are Brand Assets. Nothing here needs updating when Figma adds a
// category.
export const COMPONENT_SECTION = "Components";

export function isRegistryComponent(
  entry: { section?: string } | null | undefined,
): boolean {
  return entry?.section === COMPONENT_SECTION;
}

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
