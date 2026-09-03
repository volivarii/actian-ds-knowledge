// The completeness model.
//
// A Slot is a named, measurable part of a Thing. It is NOT a schema field:
// several Slots read the same field, and `Job` reads across files entirely —
// whether any Product's use case names this Pattern. That is why each table
// takes a NORMALISED record rather than the raw substrate: the cross-file joins
// happen once, in the record builder, and every `filled` test stays a pure
// predicate over flat data a test can construct both halves of.
//
// No score is stored. `filled` runs against data loaded at read time, which is
// honesty rule 3 — a stored score is a number that drifts from its subject.

import { SLOT_LABEL, type SlotKey } from "./nomenclature";
import { DOMAINS, type CoverageRow, type Domain } from "./coverageLoader";
import type {
  AppContextDoc,
  AppRecord,
  PatternIndex,
  TermRecord,
} from "./patternIndex";

export interface Slot<R> {
  /** Stable identity, and the key into SLOT_LABEL. */
  key: SlotKey;
  /** The word a Meter renders. Always SLOT_LABEL[key]; never a literal. */
  name: string;
  /** The honest test. Pure, and total over the record type. */
  filled: (record: R) => boolean;
  /** What it is, why it matters, and the best real example in the substrate. */
  help: string;
  /** The verb an author acts on. */
  action: string;
}

/** Words, not characters: the bar is stated in words and the corpus was
 *  measured in words. */
export function wordCount(s: string | null | undefined): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Pattern bodies are bimodal with a real gap: 8-18 words, then nothing until
 * 40. The bar sits IN the gap the corpus already has rather than at a number
 * somebody liked. `slots.test.ts` re-derives the gap and fails if it closes,
 * because a threshold whose justification has gone is a guessed threshold.
 *
 * This reasoning does NOT transfer. Entity bodies run 5-38 words with no gap
 * anywhere, so Entity has no Description Slot at all — decided on #644.
 */
export const DESCRIPTION_MIN_WORDS = 40;

// ------------------------------------------------------------------- Pattern

export interface PatternSlotRecord {
  slug: string;
  label: string;
  when: string | null;
  components: string[];
  apps: string[];
  tags: string[];
  description: string | null;
  /**
   * How many captures name this pattern. The DECLARED join, from the recipe's
   * own `patterns` list — not "is there a file called <slug>.json". A capture
   * is named for the surface it was taken from as often as for the pattern it
   * shows: `studio-quick-edit-drawer.json` captures `right-sliding-drawer`.
   * The filename join returns the same total today and is wrong about which
   * patterns it counted, which is the kind of agreement that hides a defect
   * until a fifth recipe lands.
   */
  captureCount: number;
  /**
   * True when some Product's use case names this pattern. Cross-file, and a
   * different question from `apps`: a pattern can claim Studio while no use
   * case in Studio reaches it. That gap is the finding.
   */
  namedByJob: boolean;
}

export function patternSlotRecords(index: PatternIndex): PatternSlotRecord[] {
  const reached = new Set<string>();
  for (const app of index.apps) {
    for (const uc of app.useCases) {
      for (const p of uc.patterns) reached.add(p.slug);
    }
  }
  return index.patterns.map((row) => ({
    slug: row.slug,
    label: row.label,
    when: row.when,
    components: row.components,
    apps: row.apps,
    tags: row.tags,
    description: row.description,
    captureCount: row.recipes.length,
    namedByJob: reached.has(row.slug),
  }));
}

export const PATTERN_SLOTS: Slot<PatternSlotRecord>[] = [
  {
    key: "rule",
    name: SLOT_LABEL.rule,
    filled: (r) => wordCount(r.when) > 0,
    help: "When to reach for this pattern and what to use instead — the sentence that stops it being applied to the wrong problem. access-request-management names the pattern it must not be confused with.",
    action: "Write",
  },
  {
    key: "description",
    name: SLOT_LABEL.description,
    filled: (r) => wordCount(r.description) >= DESCRIPTION_MIN_WORDS,
    help: `What a reader sees on the page, in enough detail to build from. Bodies here are either a stub or a real description with nothing in between, so the bar is ${DESCRIPTION_MIN_WORDS} words. access-request-management describes its table column by column.`,
    action: "Write",
  },
  {
    key: "built_from",
    name: SLOT_LABEL.built_from,
    filled: (r) => r.components.length > 0,
    help: "The DS components this pattern composes. asset-detail-360 names sixteen, which is what makes it answerable when someone asks what a detail page is made of.",
    action: "Attach",
  },
  {
    key: "used_in",
    name: SLOT_LABEL.used_in,
    filled: (r) => r.apps.length > 0,
    help: "The products this pattern appears in. right-sliding-drawer claims both Studio and Explorer, which is why it has two captures that differ.",
    action: "Attach",
  },
  {
    key: "job",
    name: SLOT_LABEL.job,
    filled: (r) => r.namedByJob,
    help: "A job some product's use case says this pattern serves. Claiming a product is not the same as being reached by it: search-filtered-table is named by a Studio use case, while ai-analyst-panel claims a product no use case sends anyone to.",
    action: "Attach",
  },
  {
    key: "tags",
    name: SLOT_LABEL.tags,
    filled: (r) => r.tags.length > 0,
    help: "The words someone would search for. access-request-management carries queue, review, approve, table and requests.",
    action: "Write",
  },
  {
    key: "capture",
    name: SLOT_LABEL.capture,
    filled: (r) => r.captureCount > 0,
    help: "A captured page recipe showing this pattern as built. right-sliding-drawer has two, taken from different surfaces; most patterns have none, which is why a reader cannot yet see what any of them look like.",
    action: "Capture",
  },
];

// -------------------------------------------------------------------- Entity

export interface EntitySlotRecord {
  slug: string;
  label: string;
  propertyCount: number;
  /** The verbs this entity relates by. Kept rather than reduced to a count so a
   *  narrow parse is visible: the verbs are open and half of them are camelCase. */
  relationshipVerbs: string[];
  apps: string[];
}

export function entitySlotRecords(doc: AppContextDoc): EntitySlotRecord[] {
  return Object.entries(doc.entities ?? {})
    .map(([slug, e]) => ({
      slug,
      label: e.label ?? slug,
      propertyCount: (e.properties ?? []).length,
      relationshipVerbs: Object.keys(e.relationships ?? {}),
      apps: e.apps ?? [],
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Three Slots, and deliberately no Description.
 *
 * Entity bodies run 5 to 38 words with no gap anywhere in the distribution, so
 * every word-count bar is chosen rather than derived; the Pattern bar would
 * report 0 of 30 and read as a system-wide failure. Decided on #644, option
 * (a): a one-line gloss is the intended form for an Entity.
 *
 * The cost, stated because it is real: an entity with nine relationships and a
 * six-word gloss reports as complete. The measure that would catch that is
 * structural — "the body names every entity it links to", 7 of 22 today — and
 * it is recorded on #644 as available if the Entity brief ever reads too
 * easily complete.
 */
export const ENTITY_SLOTS: Slot<EntitySlotRecord>[] = [
  {
    key: "properties",
    name: SLOT_LABEL.properties,
    filled: (r) => r.propertyCount > 0,
    help: "The fields this entity carries. access-request lists six, one of them an enum with its states, which is what lets a form be designed from the record.",
    action: "Write",
  },
  {
    key: "link",
    name: SLOT_LABEL.link,
    filled: (r) => r.relationshipVerbs.length > 0,
    help: "How this entity sits in the model — what it contains, belongs to or uses. access-request uses an output-port and requires a use-case; api-key stands alone.",
    action: "Attach",
  },
  {
    key: "used_in",
    name: SLOT_LABEL.used_in,
    filled: (r) => r.apps.length > 0,
    help: "The products this entity appears in. access-request is in both Studio and Explorer, which is why its states have to read for two audiences.",
    action: "Attach",
  },
];

// ------------------------------------------------------------------- Product

export interface ProductSlotRecord {
  slug: string;
  label: string;
  purpose: string;
  sidebarCount: number;
  /** Routing keywords, not prose. See the Signals Slot below. */
  signals: string[];
  useCaseCount: number;
  everyUseCaseHasAudience: boolean;
  everyUseCaseHasJobs: boolean;
}

export function productSlotRecords(doc: AppContextDoc): ProductSlotRecord[] {
  return Object.entries(doc.apps ?? {})
    .map(([slug, a]: [string, AppRecord]) => {
      const useCases = a.useCases ?? [];
      return {
        slug,
        label: a.label ?? slug,
        purpose: a.purpose ?? "",
        sidebarCount: (a.sidebar ?? []).length,
        signals: a.signals ?? [],
        useCaseCount: useCases.length,
        // "Every use case" and not "some": one described audience among three
        // undescribed ones is not an answered question. A product with no use
        // cases at all fails both, which is correct — there is nothing to read.
        everyUseCaseHasAudience:
          useCases.length > 0 &&
          useCases.every((u) => (u.audience ?? []).length > 0),
        everyUseCaseHasJobs:
          useCases.length > 0 && useCases.every((u) => (u.jobs ?? []).length > 0),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const PRODUCT_SLOTS: Slot<ProductSlotRecord>[] = [
  {
    key: "purpose",
    name: SLOT_LABEL.purpose,
    filled: (r) => wordCount(r.purpose) > 0,
    help: "What this product is for, in one sentence. studio says it in ten words.",
    action: "Write",
  },
  {
    key: "audience",
    name: SLOT_LABEL.audience,
    filled: (r) => r.everyUseCaseHasAudience,
    help: "Who each use case is for. studio names a Data steward and a Data architect, which is what makes its jobs readable as somebody's day.",
    action: "Write",
  },
  {
    key: "jobs",
    name: SLOT_LABEL.jobs,
    filled: (r) => r.everyUseCaseHasJobs,
    help: "What that audience is trying to get done. studio lists three jobs per use case.",
    action: "Write",
  },
  {
    key: "navigation",
    name: SLOT_LABEL.navigation,
    filled: (r) => r.sidebarCount > 0,
    help: "The product's own sidebar, so a pattern can be placed in it. studio has seven entries; explorer has none, which is why nothing here can say where a reader of Explorer would find anything.",
    action: "Write",
  },
  {
    key: "signals",
    name: SLOT_LABEL.signals,
    // NOT UI feedback, despite the field name. These are the words that mean
    // "you want this product" — the same job Pattern tags do.
    filled: (r) => r.signals.length > 0,
    help: "The words that route a request to this product. studio carries steward, govern, curate and lineage, which is how a request about stewardship reaches it rather than explorer.",
    action: "Write",
  },
];

// ---------------------------------------------------------------------- Term

export interface TermSlotRecord {
  slug: string;
  label: string;
  meaning: string;
  notUse: string[];
}

export function termSlotRecords(doc: AppContextDoc): TermSlotRecord[] {
  return Object.entries(doc.terminology ?? {})
    .map(([slug, t]: [string, TermRecord]) => ({
      slug,
      label: t.use ?? slug,
      meaning: t.meaning ?? "",
      notUse: t.notUse ?? [],
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Both Slots are full today. They are declared anyway, and rendered dimmed
 *  rather than hidden (honesty rule 4): a measure that disappears when healthy
 *  cannot be seen to regress. */
export const TERM_SLOTS: Slot<TermSlotRecord>[] = [
  {
    key: "meaning",
    name: SLOT_LABEL.meaning,
    filled: (r) => wordCount(r.meaning) > 0,
    help: "What the word denotes here. studio means the product, not a room.",
    action: "Write",
  },
  {
    key: "rule",
    name: SLOT_LABEL.rule,
    filled: (r) => r.notUse.length > 0,
    help: "The words to avoid in its place. data-intelligence-platform rules out 'the tool' and 'the app'.",
    action: "Write",
  },
];

// ----------------------------------------------------------------- Component

export interface ComponentSlotRecord {
  slug: string;
  label: string;
  domains: Record<Domain, boolean>;
  hasA11yRefs: boolean;
  hasCapture: boolean;
}

/**
 * `capturedSlugs` is the set of slugs with a
 * `components/dist/media/<slug>/default.webp`. An empty set is the honest
 * default when the media index cannot be read: an index that failed to load is
 * not evidence that a capture exists.
 *
 * Open question 4 in the design doc asks whether Capture should instead require
 * the canonical render to AGREE with the Figma capture. It is deliberately not
 * answered here: agreement is the fidelity oracle's measurement, it is produced
 * by another derive entirely, and a Slot depending on it would report a gap no
 * author could close from this screen. Presence is the honest test for this
 * surface.
 */
export function componentSlotRecords(
  rows: CoverageRow[],
  capturedSlugs: ReadonlySet<string>,
): ComponentSlotRecord[] {
  return rows.map((row) => ({
    slug: row.slug,
    label: row.component,
    domains: Object.fromEntries(
      DOMAINS.map((d) => [d, row.domains[d].status !== "not-started"]),
    ) as Record<Domain, boolean>,
    hasA11yRefs: row.a11yRefs.length > 0,
    hasCapture: capturedSlugs.has(row.slug),
  }));
}

const DOMAIN_HELP: Record<Domain, string> = {
  content:
    "The words in and around the component — labels, empty states, errors. alert-banner carries one line per status.",
  usage:
    "When to reach for it and when not to. The guidance designers ask for most, and the one most often missing; button is the one to read first.",
  design:
    "How it looks and why: anatomy, spacing, the variants and what each is for. badge shows the shape-carries-kind rule at its smallest.",
  behavior:
    "What it does when touched — states, focus, keyboard, motion. drawer is the one with real focus management to copy.",
  tokens:
    "Which design tokens it binds, so a theme change reaches it. button binds every interactive family.",
};

/**
 * The five guidance domains become Slots, so the workspace's task cards and a
 * Meter are the same data rather than two counts that can disagree.
 *
 * Built by mapping DOMAINS rather than by listing the five, so a domain added
 * to the loader cannot silently stop being measured.
 */
export const COMPONENT_SLOTS: Slot<ComponentSlotRecord>[] = [
  ...DOMAINS.map(
    (d): Slot<ComponentSlotRecord> => ({
      key: d as SlotKey,
      name: SLOT_LABEL[d as SlotKey],
      // Any status but not-started: `inherited` means the guidance exists on
      // the category, which is a deliberate answer and not a gap.
      filled: (r) => r.domains[d],
      help: DOMAIN_HELP[d],
      action: "Write",
    }),
  ),
  {
    key: "must_follow",
    name: SLOT_LABEL.must_follow,
    filled: (r) => r.hasA11yRefs,
    help: "The accessibility criteria this component has to meet. alert-banner names the ones a status colour has to survive.",
    action: "Attach",
  },
  {
    key: "capture",
    name: SLOT_LABEL.capture,
    filled: (r) => r.hasCapture,
    help: "A captured image of the component's default variant, which is what a render can be checked against. button has one; a component without it cannot be checked at all.",
    action: "Capture",
  },
];
