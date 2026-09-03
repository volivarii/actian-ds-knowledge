// The editor's controlled vocabulary.
//
// One word per concept, no synonyms. Every user-visible name for a Thing, a
// State, an Action or a Link is declared here and nowhere else, so a screen
// cannot invent a second word for something that already has one. That is
// exactly how `approved` came to render as "Approved" in the component
// workspace and "ready" in the coverage table one screen apart, and how one
// record type ended up called Features, Patterns and `#/feature/` at once.
//
// THING_LABEL and LINK_FAMILY are keyed by the substrate's own identifiers
// (graph node and edge types), so for those this file is a translation layer
// and never a second source of truth: `tests/lib/nomenclature.test.ts` asserts
// the join against the real graph in BOTH directions — a type with no word
// fails, and a word declared for a type the graph never emits fails too.
//
// STATE_LABEL is the exception, and it is worth being honest about. Its keys
// (`empty`, `draft`) are NOT substrate identifiers: the substrate says
// `not-started` and, depending on which loader you read, `authored` or `draft`.
// So this map is a genuine second vocabulary, and the join it needs is to the
// TYPES that consume it — enforced below by a compile-time exhaustiveness
// check against both status unions, because a runtime graph join is not
// available for something the graph does not carry.

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

/**
 * The substrate's own status values, from the two loaders that carry them.
 * Restated here ONLY so the mapping below can be checked at compile time; if a
 * loader gains a status, `STATE_FOR_STATUS` stops being exhaustive and the
 * build fails rather than a screen rendering a blank badge.
 */
export type SubstrateStatus =
  | "not-started"
  | "authored"
  | "draft"
  | "approved"
  | "inherited";

/** Every substrate status, mapped to the one word a reader sees. Consumers
 *  read THIS rather than building their own Record, which is how one state
 *  came to render as "Approved" on one screen and "ready" on the next. */
export const STATE_FOR_STATUS: Record<SubstrateStatus, string> = {
  "not-started": STATE_LABEL.empty,
  authored: STATE_LABEL.draft,
  draft: STATE_LABEL.draft,
  approved: STATE_LABEL.approved,
  inherited: STATE_LABEL.inherited,
};

// NOTE: the Action verbs (Open · Edit · Stage · Submit · Reveal · Jump) are
// part of the agreed vocabulary but are NOT declared here yet. Declaring them
// while every screen still renders "Add to batch", "Open in full editor" and
// "View source" would be config nothing reads, carrying a docstring that
// claimed a rename which had not happened — the same dead config this module
// deletes elsewhere. They land in the phase that applies them.


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
export interface LinkBinding {
  family: LinkKey;
  /**
   * True when the edge runs the opposite way from the family's natural reading
   * — the edge points from the CONTAINER to the CONTAINED, so this record's
   * OUTBOUND neighbours are what it contains rather than what it belongs to.
   *
   * This flag exists because the orientation was got wrong twice. A plain
   * `edgeType -> family` map silently assumes every edge in a family points the
   * same way, and membership edges do not: `in_category` and `in_app` point
   * child -> parent, while `narrower` points parent -> child. Without the flag,
   * a Foundation's own sub-sections read "Part of" instead of "Contains".
   */
  flipped?: true;
}

export const LINK_FAMILY: Record<string, LinkBinding> = {
  // Composition: the edge points at what this record is made of.
  composed_of: { family: "composition" },
  uses_component: { family: "composition" },
  // Membership, child -> parent: the edge points at what this record belongs to.
  in_category: { family: "membership" },
  in_app: { family: "membership" },
  // Membership, parent -> child. `foundation:color-primitives --narrower-->
  // foundation:color-primitives/primitives` — the source CONTAINS the target,
  // so this record's outbound neighbours are its children.
  narrower: { family: "membership", flipped: true },
  // Compliance: the edge points at the rule this record must meet.
  a11y_ref: { family: "compliance" },
  foundations_ref: { family: "compliance" },
  motion_ref: { family: "compliance" },
  // Association is symmetric, so orientation cannot be wrong.
  related: { family: "association" },
  entity_related: { family: "association" },
  term_about: { family: "association" },
};

/** The word for a Thing; "Node" for anything unmapped.
 *
 *  `Object.hasOwn`, not `??`: an inherited key like `constructor` or `toString`
 *  is truthy, so the nullish fallback never fires and the function returns a
 *  Function where its signature promises a string. The map this replaced was
 *  keyed on a composite `"type:direction"` string that could never collide with
 *  a prototype name; these plainer keys can. */
export function thingLabel(type: string): string {
  return Object.hasOwn(THING_LABEL, type)
    ? THING_LABEL[type as ThingKey]
    : "Node";
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
  // Object.hasOwn for the same reason as thingLabel: LINK_FAMILY["constructor"]
  // is truthy-by-inheritance, so `??` left it unguarded and the next line threw
  // instead of returning the documented fallback.
  const binding: LinkBinding = Object.hasOwn(LINK_FAMILY, edgeType)
    ? LINK_FAMILY[edgeType]!
    : { family: "association" };
  const side = binding.flipped
    ? direction === "out"
      ? "in"
      : "out"
    : direction;
  return LINK_LABEL[binding.family][side];
}

/**
 * Slots — the named, measurable parts of a Thing.
 *
 * A Slot is not a schema field: several Slots read the same field, and `Job`
 * reads across files entirely. What is declared HERE is only the WORD, for the
 * same reason every other word is here — a Meter renders it, so it is a
 * user-visible concept and it gets exactly one home. The tables and the
 * `filled` tests live in `lib/slots.ts`.
 *
 * Three of these ARE Link words seen from one end, and they are DERIVED from
 * LINK_LABEL rather than repeated. A Pattern's `Built from` is the composition
 * edge read outbound; if that word ever changes it must change in one place.
 *
 * `job` and `jobs` are deliberately different words for different things: a
 * Product HAS jobs, a Pattern SERVES one. `rule` is one key used by two tables
 * — a Pattern's `when` and a Term's `notUse` are the same question asked of
 * two Things — which is the point of keying on the word rather than the field.
 */
export type SlotKey =
  // Pattern
  | "rule"
  | "description"
  | "built_from"
  | "used_in"
  | "job"
  | "tags"
  | "capture"
  // Entity
  | "properties"
  | "link"
  // Product
  | "purpose"
  | "audience"
  | "jobs"
  | "navigation"
  | "signals"
  // Term
  | "meaning"
  // Component — the five guidance domains, plus what they are checked against
  | "content"
  | "usage"
  | "design"
  | "behavior"
  | "tokens"
  | "must_follow";

export const SLOT_LABEL: Record<SlotKey, string> = {
  rule: "Rule",
  description: "Description",
  built_from: LINK_LABEL.composition.out,
  used_in: LINK_LABEL.composition.in,
  job: "Job",
  tags: "Tags",
  capture: "Capture",
  properties: "Properties",
  link: "Link",
  purpose: "Purpose",
  audience: "Audience",
  jobs: "Jobs",
  navigation: "Navigation",
  signals: "Signals",
  meaning: "Meaning",
  content: "Content",
  usage: "Usage",
  design: "Design",
  behavior: "Behavior",
  tokens: "Tokens",
  must_follow: LINK_LABEL.compliance.out,
};

export function slotLabel(key: SlotKey): string {
  return SLOT_LABEL[key];
}
