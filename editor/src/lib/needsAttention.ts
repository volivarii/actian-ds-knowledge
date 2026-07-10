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

export interface AttentionItem {
  slug: string;
  component: string;
  origin: CoverageRow["origin"];
  /** Domains with status "not-started", in canonical DOMAINS order. */
  missing: Domain[];
  /** Navigation target — the component's authoring workspace. */
  target: string;
}

/** Rows whose usage guidance is not started, regardless of origin. */
export function usageGapCount(rows: CoverageRow[]): number {
  return rows.filter((r) => r.domains.usage.status === "not-started").length;
}

function missingDomains(row: CoverageRow): Domain[] {
  return DOMAINS.filter((d) => row.domains[d].status === "not-started");
}

function band(row: CoverageRow, missing: Domain[]): number {
  if (row.origin === "authored" && missing.includes("usage")) return 0;
  if (row.origin === "unstarted") return 1;
  return 2;
}

export function topGaps(rows: CoverageRow[], limit: number): AttentionItem[] {
  return rows
    .map((row) => ({ row, missing: missingDomains(row) }))
    .filter(({ missing }) => missing.length > 0)
    .sort((a, b) => {
      const byBand = band(a.row, a.missing) - band(b.row, b.missing);
      if (byBand !== 0) return byBand;
      return a.row.slug.localeCompare(b.row.slug);
    })
    .slice(0, limit)
    .map(({ row, missing }) => ({
      slug: row.slug,
      component: row.component,
      origin: row.origin,
      missing,
      target: `workspace/${row.slug}`,
    }));
}
