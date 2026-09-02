// The editor's controlled vocabulary.
//
// One word per concept, no synonyms. Every user-visible name for a Thing, a
// State, an Action or a Link is declared here and nowhere else, so a screen
// cannot invent a second word for something that already has one. That is
// exactly how `approved` came to render as "Approved" in the component
// workspace and "ready" in the coverage table one screen apart, and how one
// record type ended up called Features, Patterns and `#/feature/` at once.
//
// Keys are the substrate's own identifiers (graph node types, graph edge
// types, domain status values), so this file is a translation layer and never
// a second source of truth. `tests/lib/nomenclature.test.ts` asserts the join
// against the real graph in both directions: a node or edge type with no word
// fails, and a word declared for a type the graph never emits fails too.

/** Graph node types, from `graph/dist/graph.json`. */
export type ThingKey =
  | "component"
  | "category"
  | "foundation_section"
  | "a11y_criterion"
  | "content_topic"
  | "motion_pattern"
  | "app"
  | "ux_pattern"
  | "app_entity"
  | "terminology_term";

/**
 * Two families, as the sidebar already groups them: Core is what the design
 * system prescribes, Context is what the products are.
 *
 * Every word is a single noun. The old labels qualified three of them
 * ("Accessibility criterion", "Content topic", "Motion pattern"), which reads
 * as a category rather than as a name.
 */
export const THING_LABEL: Record<ThingKey, string> = {
  // Core — what the design system prescribes
  component: "Component",
  category: "Category",
  foundation_section: "Foundation",
  a11y_criterion: "Criterion",
  content_topic: "Topic",
  motion_pattern: "Motion",
  // Context — what the products are
  app: "Product",
  ux_pattern: "Pattern",
  app_entity: "Entity",
  terminology_term: "Term",
};

export type StateKey = "empty" | "draft" | "approved" | "inherited";

/**
 * One vocabulary, replacing two. `not-started` rendered as both "Not started"
 * and "—"; `approved` rendered as both "Approved" and "ready"; `authored`
 * rendered as "Authored — in batch / remote". `synthesized` is deliberately
 * absent: it is CI-only and never surfaced.
 */
export const STATE_LABEL: Record<StateKey, string> = {
  empty: "Empty",
  draft: "Draft",
  approved: "Approved",
  inherited: "Inherited",
};

export type ActionKey =
  | "open"
  | "edit"
  | "stage"
  | "submit"
  | "reveal"
  | "jump";

/** Six verbs. "Add to batch" became Stage, "Open in full editor" became Edit,
 *  and Show/Hide, View source and the bare `▸` all became Reveal. */
export const ACTION_LABEL: Record<ActionKey, string> = {
  open: "Open",
  edit: "Edit",
  stage: "Stage",
  submit: "Submit",
  reveal: "Reveal",
  jump: "Jump",
};

/**
 * Link families. Each is a reciprocal pair so one relationship reads correctly
 * from either end — "Asset detail 360 is Built from Tabs", and on Tabs,
 * "Used in — Asset detail 360".
 *
 * The 24 one-off phrases these replace gave each side of each edge its own
 * wording, so the same relationship read as "Built from these components" on
 * one screen and "Used in patterns" on another.
 */
export type LinkKey =
  | "composition"
  | "membership"
  | "compliance"
  | "association";

export interface LinkPair {
  /** This record points at the neighbour. */
  out: string;
  /** The neighbour points at this record. */
  in: string;
}

export const LINK_LABEL: Record<LinkKey, LinkPair> = {
  composition: { out: "Built from", in: "Used in" },
  membership: { out: "Part of", in: "Contains" },
  compliance: { out: "Must follow", in: "Required by" },
  association: { out: "Related to", in: "Related to" },
};

/**
 * Graph edge type -> Link family.
 *
 * `in_app` is `membership`, not composition, and the distinction is
 * load-bearing. The edge points Pattern -> Product, so from the Pattern's side
 * "out" means "belongs to Studio", not "built from Studio". Structurally it is
 * the same shape as `in_category`: this belongs to that. Folding it into
 * composition merged two different questions — what am I part of, and what am
 * I made of — into one list.
 *
 * Every edge type present in `graph/dist/graph.json` must appear here, and
 * nothing else may. The old map carried a `uses_pattern` entry for a
 * relationship nothing in the graph emits; the test that would have caught it
 * did not exist.
 */
export const LINK_FAMILY: Record<string, LinkKey> = {
  composed_of: "composition",
  uses_component: "composition",
  in_category: "membership",
  in_app: "membership",
  narrower: "membership",
  a11y_ref: "compliance",
  foundations_ref: "compliance",
  motion_ref: "compliance",
  related: "association",
  entity_related: "association",
  term_about: "association",
};

/** The word for a Thing; "Node" for anything unmapped. */
export function thingLabel(type: string): string {
  return THING_LABEL[type as ThingKey] ?? "Node";
}

/**
 * The word for one side of a Link.
 *
 * An edge type with no family falls back to "Related to" rather than to
 * humanised snake_case: an unknown relationship is an association we cannot
 * name, not a new word to show a reader. The old fallback turned
 * `composition_edges` into "Composition edges" and put it on screen.
 */
export function linkLabel(edgeType: string, direction: "in" | "out"): string {
  const family = LINK_FAMILY[edgeType] ?? "association";
  return LINK_LABEL[family][direction];
}
