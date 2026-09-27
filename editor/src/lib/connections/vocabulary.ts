// The words of the Connections section. Shared words come from the nomenclature
// (LINK_LABEL) so a relation reads the same here as everywhere else; the words
// below are the distinctions only this section makes (Nested in vs Used in
// patterns, the entity verbs, where a link is stored).
import { LINK_LABEL } from "../nomenclature";
import type { StoreKind } from "./types";

export const STORE_LABEL: Record<StoreKind, string> = {
  here: "Editable here",
  figma: "Set in Figma",
  other: "Set on the other record",
  inherited: "Comes with the category",
  text: "Links in the guidance text",
  inferred: "Matched by name",
  structure: "Set by the folder structure",
};

export const VERBS = [
  "belongsTo",
  "contains",
  "uses",
  "relatesTo",
  "appliesTo",
  "consumes",
  "produces",
  "requires",
  "derivedFrom",
  "subtypeOf",
] as const;
export type Verb = (typeof VERBS)[number];

export const VERB_LABEL: Record<Verb, string> = {
  belongsTo: "Belongs to",
  contains: "Contains",
  uses: "Uses",
  relatesTo: "Related to",
  appliesTo: "Applies to",
  consumes: "Consumes",
  produces: "Produces",
  requires: "Requires",
  derivedFrom: "Derived from",
  subtypeOf: "Subtype of",
};
const VERB_SENTENCE: Record<Verb, string> = {
  belongsTo: "Entities {name} belongs to.",
  contains: "Entities {name} holds.",
  uses: "Entities {name} depends on.",
  relatesTo: "Entities {name} is related to.",
  appliesTo: "Entities {name} applies to.",
  consumes: "Entities {name} reads from.",
  produces: "Entities {name} creates.",
  requires: "Entities {name} can't exist without.",
  derivedFrom: "Entities {name} is computed from.",
  subtypeOf: "The entity {name} is a kind of.",
};
const VERB_PHRASE: Record<Verb, string> = {
  belongsTo: "belongs to",
  contains: "contains",
  uses: "uses",
  relatesTo: "is related to",
  appliesTo: "applies to",
  consumes: "consumes",
  produces: "produces",
  requires: "requires",
  derivedFrom: "is derived from",
  subtypeOf: "is a kind of",
};
const INVERSE_LABEL: Record<Verb, string> = {
  belongsTo: "Has",
  contains: "Contained by",
  uses: "Used by",
  relatesTo: "Related from",
  appliesTo: "Applied by",
  consumes: "Consumed by",
  produces: "Produced by",
  requires: "Required by",
  derivedFrom: "Source of",
  subtypeOf: "Supertype of",
};

export function verbPhrase(verb: string): string {
  return (VERB_PHRASE as Record<string, string>)[verb] ?? "is related to";
}

export interface GroupDef {
  key: string;
  label: string;
  /** Under the label, about the whole group. */
  sentence: string;
  /** In the panel, about one link: {name} is this record, {other} the linked one. */
  phrase: string;
}

type Dir = "out" | "in";
const TABLE: Record<string, Partial<Record<Dir, GroupDef>>> = {
  in_category: {
    out: { key: "part-of", label: LINK_LABEL.membership.out, sentence: "The Figma category {name} sits in.", phrase: "{name} is part of {other} in Figma." },
    in: { key: "members", label: LINK_LABEL.membership.in, sentence: "Records that sit in {name}.", phrase: "{other} is part of {name} in Figma." },
  },
  in_app: {
    out: { key: "part-of", label: LINK_LABEL.membership.out, sentence: "Products where {name} appears.", phrase: "{name} appears in {other}." },
    in: { key: "members", label: LINK_LABEL.membership.in, sentence: "Records that sit in {name}.", phrase: "{other} appears in {name}." },
  },
  composed_of: {
    out: { key: "built-from", label: LINK_LABEL.composition.out, sentence: "Components nested inside {name} in Figma.", phrase: "{name} contains {other} in Figma." },
    in: { key: "nested-in", label: "Nested in", sentence: "Components that contain {name} in Figma.", phrase: "{other} contains {name} in Figma." },
  },
  uses_component: {
    out: { key: "built-from", label: LINK_LABEL.composition.out, sentence: "Components this pattern is made of.", phrase: "{name} is built from {other}." },
    in: { key: "used-in-patterns", label: "Used in patterns", sentence: "Patterns that list {name} among their components.", phrase: "{other} is built from {name}." },
  },
  a11y_ref: {
    out: { key: "must-follow", label: LINK_LABEL.compliance.out, sentence: "Rules chosen for {name}.", phrase: "{name} must follow {other}." },
    in: { key: "required-by", label: LINK_LABEL.compliance.in, sentence: "Components and categories that must follow {name}.", phrase: "{other} must follow {name}." },
  },
  shown_in: {
    out: { key: "shown-in", label: LINK_LABEL.appearance.out, sentence: "Patterns that display {name}.", phrase: "{name} is shown in {other}." },
    in: { key: "shows", label: LINK_LABEL.appearance.in, sentence: "Entities that list {name} as a place they appear.", phrase: "{other} is shown in {name}." },
  },
  related: {
    out: { key: "about", label: "About", sentence: "Components this topic is about.", phrase: "{name} is about {other}." },
    in: { key: "mentioned-in-content", label: "Mentioned in topics", sentence: "Topics that list {name}.", phrase: "{other} is about {name}." },
  },
  narrower: {
    out: { key: "sections", label: LINK_LABEL.membership.in, sentence: "Sub-sections of {name}.", phrase: "{other} is a section of {name}." },
    in: { key: "parent", label: LINK_LABEL.membership.out, sentence: "The foundation section {name} sits in.", phrase: "{name} is a section of {other}." },
  },
  term_about: {
    out: { key: "term-of", label: "About", sentence: "The record this term's name matches.", phrase: "{name} is the term for {other}." },
    in: { key: "glossary-term", label: "Terms", sentence: "Terms whose name matches {name}. Nothing is stored.", phrase: "{other} is a term for {name}." },
  },
};
TABLE.foundations_ref = TABLE.a11y_ref!;
TABLE.motion_ref = TABLE.a11y_ref!;

export function groupDef(edgeType: string, direction: Dir, predicate?: string): GroupDef | null {
  if (edgeType === "entity_related") {
    const v = (predicate ?? "relatesTo") as Verb;
    if (!VERBS.includes(v)) return null;
    return direction === "out"
      ? { key: `rel:${v}`, label: VERB_LABEL[v], sentence: VERB_SENTENCE[v], phrase: `{name} ${VERB_PHRASE[v]} {other}.` }
      : {
          key: `in:${v}`,
          label: INVERSE_LABEL[v],
          sentence: `Entities that say they ${VERB_PHRASE[v]} {name}, with no link back from here.`,
          phrase: `{other} ${VERB_PHRASE[v]} {name}.`,
        };
  }
  return (Object.hasOwn(TABLE, edgeType) && TABLE[edgeType]![direction]) || null;
}

/** The inherited group: a component's category rules. */
export function inheritedGroupDef(categoryTitle: string): GroupDef {
  return {
    key: "must-follow-via",
    label: `${LINK_LABEL.compliance.out}, via ${categoryTitle}`,
    sentence: `Rules every component in ${categoryTitle} follows.`,
    phrase: `{name} must follow {other}, through ${categoryTitle}.`,
  };
}
export const MENTIONED_GROUP: GroupDef = {
  key: "mentioned",
  label: "Mentioned in guidance",
  sentence: "Components linked from {name}'s guidance text.",
  phrase: "{name}'s guidance links to {other}.",
};
export const NAMED_GROUP: GroupDef = {
  key: "named",
  label: "Named in the text",
  sentence: "Patterns the text names without linking to them.",
  phrase: "{name}'s text names {other} without linking to it.",
};

export function storeFor(edgeType: string, direction: Dir): StoreKind {
  if (edgeType === "composed_of" || edgeType === "in_category") return "figma";
  if (edgeType === "narrower") return "structure";
  if (edgeType === "term_about") return "inferred";
  return direction === "out" ? "here" : "other";
}

/** Plain description of where a group's links live, for the panel. */
export function whereFor(edgeType: string, direction: Dir): string {
  if (edgeType === "composed_of" || edgeType === "in_category") return "Figma";
  if (edgeType === "narrower") return "the foundations tree";
  if (edgeType === "term_about") return "a name match when the graph is built";
  if (direction === "out") return "this record";
  const other: Record<string, string> = {
    uses_component: "each pattern's list of components",
    shown_in: "each entity's list of patterns",
    in_app: "each record's list of products",
    a11y_ref: "each component's or category's rules",
    foundations_ref: "each component's or category's rules",
    motion_ref: "each component's or category's rules",
    related: "each topic's related components",
    entity_related: "the other entity's relationships",
  };
  return other[edgeType] ?? "the other record";
}

/** Group order: out groups first, then in. `rel:*` and `in:*` cover every verb. */
export const GROUP_ORDER: string[] = [
  "part-of", "built-from", "must-follow", "must-follow-via", "shown-in", "rel:*",
  "about", "sections", "term-of", "mentioned", "named",
  "nested-in", "used-in-patterns", "shows", "members", "required-by",
  "mentioned-in-content", "in:*", "glossary-term", "parent",
];
export function groupRank(key: string): number {
  const i = GROUP_ORDER.indexOf(key.replace(/:.*$/, ":*"));
  return i < 0 ? GROUP_ORDER.length : i;
}

export function fillName(sentence: string, name: string): string {
  return sentence.replace(/\{name\}/g, name);
}
export function fillOther(phrase: string, other: string): string {
  return phrase.replace(/\{other\}/g, other);
}
