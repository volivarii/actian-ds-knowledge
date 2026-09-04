// Needs-attention ranking for the editor's front door (HomeScreen).
//
// Turns the coverage rows into a short, prioritized list of "the most
// valuable thing to write next". Priority bands:
//   0 — authored components whose `usage` domain is not-started
//       (real components someone began, missing the guidance designers
//       ask for most — the coverage debt the whole system is starved of)
//   1 — unstarted registry components (no _meta.yml at all)
//   2 — authored components with any other not-started domain
// Alphabetical by slug within a band. Pure data transform, no I/O.

import { DOMAIN_LABEL } from "./workspaceState";
import {
  DOMAINS,
  type CoverageRow,
  type Domain,
  type Status,
} from "./coverageLoader";

/** Priority band. Rides each AttentionItem so UI copy keyed by it (an
 *  exhaustive Record<AttentionBand, …> — see HomeScreen.BAND_ACTION_LABEL)
 *  stays tied to the same classification that produced the ordering. */
export type AttentionBand = 0 | 1 | 2;

export interface AttentionItem {
  slug: string;
  component: string;
  band: AttentionBand;
  /** Domains with status "not-started", in canonical DOMAINS order. */
  missing: Domain[];
  /**
   * Every domain's status, not just the absent ones.
   *
   * `missing` answers "what is unwritten", which is what the ranking needs.
   * The readout beside each row has to distinguish written from
   * half-written from unwritten, and a list of absences cannot tell the
   * first two apart. Carried here rather than re-read from the row so the
   * item stays the whole answer for one line of the list.
   */
  statuses: Record<Domain, Status>;
  /** Navigation target — the component's authoring workspace. */
  target: string;
}

/** Rows with at least one not-started domain — the needs-attention total,
 *  without paying topGaps' sort. */
export function gapCount(rows: CoverageRow[]): number {
  return rows.filter((r) => missingDomains(r).length > 0).length;
}

/** The row's five statuses, flattened out of its DomainEntry map. */
function statusesOf(row: CoverageRow): Record<Domain, Status> {
  return Object.fromEntries(
    DOMAINS.map((d) => [d, row.domains[d].status]),
  ) as Record<Domain, Status>;
}

function missingDomains(row: CoverageRow): Domain[] {
  return DOMAINS.filter((d) => row.domains[d].status === "not-started");
}

function band(row: CoverageRow, missing: Domain[]): AttentionBand {
  if (row.origin === "authored" && missing.includes("usage")) return 0;
  if (row.origin === "unstarted") return 1;
  return 2;
}

/**
 * The domain with the most unwritten components, and how many.
 *
 * The front door used to show eight rows of badges and leave the reader to
 * infer the shape of the backlog from them. It has a shape: one domain
 * accounts for most of it, and a sentence saying which is worth more than a
 * list you have to count. `null` when nothing is unwritten, so the caller
 * says "nothing is open" rather than "0 open".
 */
export function largestGap(
  rows: CoverageRow[],
): { domain: Domain; open: number; total: number } | null {
  if (rows.length === 0) return null;
  let worst: { domain: Domain; open: number; total: number } | null = null;
  for (const d of DOMAINS) {
    const open = rows.filter(
      (r) => r.domains[d].status === "not-started",
    ).length;
    if (open > 0 && (worst === null || open > worst.open)) {
      worst = { domain: d, open, total: rows.length };
    }
  }
  return worst;
}

/**
 * The two facts the front door needs, told apart.
 *
 * A component nobody has started is not "missing tokens", it is missing
 * everything, and counting it in a per-domain gap makes every domain look
 * equally bad. Measured over the whole set the sentence read "Tokens is the
 * backlog: 73 of 85", while the list directly beneath it showed eight
 * components with nothing authored at all: the sentence promised one job and
 * the list offered another.
 *
 * `unstarted` is the count of components with no `_meta.yml`. `backlog` is the
 * largest gap among the ones somebody HAS started, which is the number the
 * derived coverage docs also report.
 */
export function backlogShape(rows: CoverageRow[]): {
  unstarted: number;
  started: number;
  backlog: { domain: Domain; open: number; total: number } | null;
} {
  const started = rows.filter((r) => r.origin === "authored");
  return {
    unstarted: rows.length - started.length,
    started: started.length,
    backlog: largestGap(started),
  };
}

/**
 * The front door's one sentence about the state of the substrate.
 *
 * Pure, and separate from the screen, because assembling it inline produced a
 * sentence that contradicted itself: with nothing started, the clauses read
 * "2 components have no guidance at all. Nothing is unwritten." Two
 * independent ternaries, each correct on its own, and no test could see it
 * because the fixture always had started rows.
 */
export function backlogSentence(shape: {
  unstarted: number;
  started: number;
  backlog: { domain: Domain; open: number } | null;
}): string {
  const parts: string[] = [];
  if (shape.unstarted > 0) {
    parts.push(
      `${shape.unstarted} component${shape.unstarted === 1 ? " has" : "s have"} no guidance at all.`,
    );
  }
  if (shape.backlog) {
    parts.push(
      `Of the ${shape.started} started, ${DOMAIN_LABEL[shape.backlog.domain]} is the backlog: ${shape.backlog.open} have none authored.`,
    );
  } else if (shape.started > 0) {
    parts.push(
      shape.unstarted > 0
        ? `The other ${shape.started} have every domain underway.`
        : `All ${shape.started} components have every domain underway.`,
    );
  }
  // Nothing started AND nothing unstarted is an empty substrate, which the
  // caller does not render at all. Anything else has said its piece above.
  return parts.join(" ");
}

export function topGaps(rows: CoverageRow[], limit: number): AttentionItem[] {
  return rows
    .map((row) => {
      const missing = missingDomains(row);
      return { row, missing, band: band(row, missing) };
    })
    .filter(({ missing }) => missing.length > 0)
    .sort((a, b) => {
      if (a.band !== b.band) return a.band - b.band;
      return a.row.slug.localeCompare(b.row.slug);
    })
    .slice(0, limit)
    .map(({ row, missing, band }) => ({
      slug: row.slug,
      component: row.component,
      band,
      missing,
      statuses: statusesOf(row),
      target: `workspace/${row.slug}`,
    }));
}
