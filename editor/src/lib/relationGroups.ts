// Human-relationship grouping for the relations rail's graph section.
//
// The baked graph carries typed edges (composed_of, uses_component, in_category,
// a11y_ref, ...) with a direction. On their own those keys are opaque to an
// author. This turns each (edgeType, direction) into author vocabulary and
// buckets the neighbours under it, so the rail reads "Appears in / Used in
// patterns / Contains" instead of a flat list of "composed_of" badges.
import type { Neighbor } from "../substrate/graphIndex";

// Keyed by `${edgeType}:${direction}`. Direction is relative to the current
// node: "out" = this node points at the neighbour, "in" = the neighbour points
// at this node. So a component's composed_of-out neighbour is something it
// contains; composed_of-in is something it appears inside.
const GROUP_LABEL: Record<string, string> = {
  "in_category:out": "Category",
  "in_category:in": "Components in this category",
  "composed_of:out": "Contains",
  "composed_of:in": "Appears in",
  "uses_component:out": "Built from these components",
  "uses_component:in": "Used in patterns",
  "a11y_ref:out": "Meets accessibility criterion",
  "a11y_ref:in": "Accessibility for",
  "foundations_ref:out": "Built on foundations",
  "foundations_ref:in": "Foundation for",
  "motion_ref:out": "Uses motion",
  "motion_ref:in": "Motion for",
  "related:out": "Related",
  "related:in": "Related",
  "narrower:out": "Narrower topics",
  "narrower:in": "Broader topic",
  "uses_pattern:out": "Uses patterns",
  "uses_pattern:in": "Used by patterns",
  "entity_related:out": "Related entities",
  "entity_related:in": "Related entities",
  "term_about:out": "Defines terms",
  "term_about:in": "Described by term",
  "in_app:out": "Part of these products",
  "in_app:in": "In this product",
};

/** Human label for an edge type + direction. Unknown edges are humanised (no
 *  snake_case ever reaches the surface) rather than shown raw. */
export function relationGroupLabel(
  edgeType: string,
  direction: "in" | "out",
): string {
  const exact = GROUP_LABEL[`${edgeType}:${direction}`];
  if (exact) return exact;
  const humanised = edgeType.replace(/_/g, " ").trim();
  return humanised ? humanised.charAt(0).toUpperCase() + humanised.slice(1) : "Related";
}

export interface RelationGroup {
  label: string;
  items: Neighbor[];
}

// Author priority: what this node *is* and *has* (its own facets) before the
// potentially large incoming crowds ("Appears in", "Used in patterns").
//
// Keyed by LABEL, not by edge type, so renaming a group's label without editing
// this list silently unranks it and drops it to the tail among the genuinely
// unknown edge types. Change the two together.
const GROUP_ORDER = [
  "Category",
  "Contains",
  "Built from these components",
  "Uses patterns",
  "Uses motion",
  "Built on foundations",
  "Meets accessibility criterion",
  "Defines terms",
  "Part of these products",
  "Related",
  "Related entities",
  "Narrower topics",
  "Broader topic",
  "Described by term",
  "Foundation for",
  "Motion for",
  "Accessibility for",
  "Appears in",
  "In this product",
  "Used in patterns",
  "Used by patterns",
  "Components in this category",
];

/** Bucket neighbours under their human relationship, groups ordered by author
 *  priority, neighbours kept in their incoming order within each group. */
export function groupGraphNeighbors(neighbors: Neighbor[]): RelationGroup[] {
  const buckets = new Map<string, Neighbor[]>();
  for (const n of neighbors) {
    const label = relationGroupLabel(n.edgeType, n.direction);
    const arr = buckets.get(label) ?? [];
    arr.push(n);
    buckets.set(label, arr);
  }
  const rank = (label: string) => {
    const i = GROUP_ORDER.indexOf(label);
    return i === -1 ? GROUP_ORDER.length : i;
  };
  return [...buckets.entries()]
    .map(([label, items]) => ({ label, items }))
    .sort((a, b) => rank(a.label) - rank(b.label));
}
