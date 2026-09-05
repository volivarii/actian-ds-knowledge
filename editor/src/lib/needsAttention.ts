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
 * The Coverage overview's one sentence, and the only place in the editor that
 * states the shape of the backlog in words.
 *
 * The hub used to carry a sentence of its own. It has been removed: analysis
 * belongs on the dashboard whose job it is, and the hub links rather than
 * explains. So this is the single sentence, and it answers "where does the
 * design system stand" by leading with what is DONE, which is the fact a
 * reader from outside the team most needs.
 *
 * It is also the fix for two numbers describing one thing a hand's width
 * apart: the screen opened with "85 components" while the sidebar said 54,
 * because the 85 counts registry components nobody has started.
 *
 * Complete is measured over the AUTHORED set only. A component with no
 * `_meta.yml` is missing every domain, so counting it makes every domain look
 * like a backlog, which is exactly how the deleted hub sentence came to
 * promise a job its own list did not offer.
 */
export function coverageSentence(rows: CoverageRow[]): string {
  const authored = rows.filter((r) => r.origin === "authored");
  const ghosts = rows.length - authored.length;
  const parts: string[] = [];

  if (authored.length === 0) {
    // Not "0 components": a registry full of unstarted components is a real
    // state and the reader needs to know the set is not empty.
    return ghosts > 0
      ? `Nothing authored yet. ${ghosts} component${ghosts === 1 ? " in the registry is" : "s in the registry are"} waiting.`
      : "No components found.";
  }

  parts.push(
    ghosts > 0
      ? `${authored.length} components authored, ${ghosts} more in the registry with nothing yet.`
      : `${authored.length} components.`,
  );

  const complete = DOMAINS.filter((d) =>
    authored.every((r) => r.domains[d].status !== "not-started"),
  );
  if (complete.length > 0) {
    parts.push(
      `${joinWords(complete.map((d) => DOMAIN_LABEL[d]))} ${complete.length === 1 ? "is" : "are"} complete.`,
    );
  }

  const worst = largestGap(authored);
  if (worst) {
    parts.push(
      `${DOMAIN_LABEL[worst.domain]} is the backlog: ${worst.open} of the ${authored.length} have none.`,
    );
  } else if (complete.length < DOMAINS.length) {
    // largestGap returned null with domains still incomplete: unreachable by
    // construction, but saying nothing here would silently drop the clause.
    parts.push("Every domain is underway.");
  }

  return parts.join(" ");
}

/** "Content and Usage", "Content, Usage and Design". Written out rather than
 *  reached for from Intl, because the list is three words long and a locale
 *  that reorders them would change what the sentence claims. */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
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
