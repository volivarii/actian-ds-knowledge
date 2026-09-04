// The scopes the substrate divides into, and the overview screen on top of
// each one's tree.
//
// This list is the editor's information architecture in one place. It exists
// because the four "Explore the data" tabs were not four of the same thing:
// coverage is the overview on top of Components, hosting is the overview on
// top of Accessibility, patterns is the overview on top of Application
// context, and substrate health is not scoped to anything at all. Naming that
// difference is what let the tabs leave the front door without losing a fact.
//
// `overview` is an `activePath` a SCREENS entry in lib/routes.ts addresses, or
// `null` for a scope whose overview has not been built yet. Null is deliberate
// and visible: a scope with no overview still appears here, so the gap is on
// screen rather than in somebody's head.

export interface Scope {
  /** Stable key, and the sort order the hub renders in. */
  key: string;
  label: string;
  /** What this scope's tree holds, in the reader's words. */
  holds: string;
  /** The `activePath` of its overview screen, or null when none exists yet. */
  overview: string | null;
}

export const SCOPES: readonly Scope[] = [
  {
    key: "foundations",
    label: "Foundations",
    holds: "Colour, type, spacing, and the two files every token derives from",
    overview: null,
  },
  {
    key: "components",
    label: "Components",
    holds: "Every component's guidance, across the five domains",
    overview: "coverage",
  },
  {
    key: "content",
    label: "Content",
    holds: "Writing rules, product guidance, and the words to avoid",
    overview: null,
  },
  {
    key: "accessibility",
    label: "Accessibility",
    holds: "Topics, and which components host each one",
    overview: "accessibility",
  },
  {
    key: "app-context",
    label: "Application context",
    holds: "Products, the things they hold, and the UX patterns that serve them",
    overview: "patterns",
  },
];

/**
 * Where a component's page goes when you go up.
 *
 * One object, because the label and the destination were two independent
 * strings: the workspace read "Back to coverage" while calling
 * setActivePath(null), which was true only for as long as home WAS the
 * coverage dashboard. Deriving the words from the address is what stops them
 * disagreeing again.
 */
export const COMPONENT_PARENT = {
  path: "coverage",
  label: "Coverage",
} as const;

/**
 * Diagnostics over the whole substrate: orphans, edge counts, the graph.
 *
 * Not a scope. It answers "is the substrate wired up", which is a question
 * about all of it at once, so it sits beside the scope list rather than inside
 * it. It used to be a tab called Relationships on the front door, where it was
 * a daily surface for a question nobody asks daily.
 */
export const SUBSTRATE_HEALTH = {
  label: "Substrate health",
  holds: "Orphans, connections, and what nothing links to",
  overview: "health",
} as const;
