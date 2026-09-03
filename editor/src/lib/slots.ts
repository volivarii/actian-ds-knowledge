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
import type { PatternIndex } from "./patternIndex";

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
