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

import { DOMAINS, type CoverageRow, type Domain } from "./coverageLoader";

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
  /** Navigation target — the component's authoring workspace. */
  target: string;
}

/** Authored components (someone started them) whose usage guidance is not
 *  started — the band-0 set, so the front door's headline number matches
 *  the top of the needs-attention list it points at. */
export function authoredUsageGapCount(rows: CoverageRow[]): number {
  return rows.filter(
    (r) => r.origin === "authored" && r.domains.usage.status === "not-started",
  ).length;
}

/** Rows with at least one not-started domain — the needs-attention total,
 *  without paying topGaps' sort. */
export function gapCount(rows: CoverageRow[]): number {
  return rows.filter((r) => missingDomains(r).length > 0).length;
}

function missingDomains(row: CoverageRow): Domain[] {
  return DOMAINS.filter((d) => row.domains[d].status === "not-started");
}

function band(row: CoverageRow, missing: Domain[]): AttentionBand {
  if (row.origin === "authored" && missing.includes("usage")) return 0;
  if (row.origin === "unstarted") return 1;
  return 2;
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
      target: `workspace/${row.slug}`,
    }));
}
