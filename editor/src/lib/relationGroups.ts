// Turns the flat, edge-type-badged graph neighbours into human-labelled groups
// so the relations rail speaks author vocabulary, never the internal edge keys
// (composed_of, uses_component, in_category, a11y_ref).
//
// The vocabulary is four reciprocal pairs from `nomenclature.ts` — eight words
// in total — so one relationship reads correctly from either end. It replaced
// 24 one-off phrases, one per side of each edge, which is how the same
// relationship read as "Built from these components" on one screen and
// "Used in patterns" on another.
import { LINK_LABEL, linkLabel } from "./nomenclature";
import type { Neighbor } from "../substrate/graphIndex";

/** The word for one side of a relationship. An unknown edge type is an
 *  association we cannot name — never humanised snake_case, which is how
 *  `composition_edges` reached a reader's screen looking deliberate. */
export function relationGroupLabel(
  edgeType: string,
  direction: "in" | "out",
): string {
  return linkLabel(edgeType, direction);
}

export interface RelationGroup {
  label: string;
  items: Neighbor[];
}

// Author priority: what this record IS and is BUILT FROM, before the
// potentially large incoming crowds.
//
// Keyed off the nomenclature rather than a hand-copied list of strings. The
// old list carried a comment warning that renaming a label without editing it
// would silently unrank the group; ranking off LINK_LABEL removes the coupling
// instead of documenting it.
//
// One consequence of the collapse, recorded rather than hidden: `in_category`
// and `in_app` are both membership, so a Component's Category and a Pattern's
// Products now share a rank. The old list ranked them 1st and 9th. Composition
// leads because it answers what a record is MADE OF, which is what an author
// opened it to change.
export const GROUP_ORDER: readonly string[] = [
  LINK_LABEL.composition.out, // Built from
  LINK_LABEL.membership.out, // Part of
  LINK_LABEL.compliance.out, // Must follow
  LINK_LABEL.association.out, // Related to
  LINK_LABEL.composition.in, // Used in
  LINK_LABEL.membership.in, // Contains
  LINK_LABEL.compliance.in, // Required by
];

/** The ranked words, in order. Exported so a test can assert the ranking
 *  COVERS the vocabulary — without that, adding a fifth family silently sorts
 *  it last, which is the failure the old hand-copied list was warned about. */
export function rankedLabels(): readonly string[] {
  return GROUP_ORDER;
}

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
