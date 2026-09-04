// The whole authoring state of the design system, in one figure.
//
// Five rows, one per guidance domain, one cell per component. It replaces the
// stack this screen used to open with: a run of statistics, then chips
// restating those same statistics, then the table they were counted from.
// Three encodings of one dataset, in sequence, none of which showed its shape.
//
// CELLS ARE SORTED, NOT ALIGNED. Reading down a column would name one
// component, which sounds useful and is not: at this size a column is 7px wide
// and unlabelled, so nobody can tell which component they are looking at. The
// table below answers "which"; this figure answers "how much", and sorting is
// what turns 54 cells into a length the eye can compare across rows.
//
// The counts beside each row name the REAL statuses, not the three lit levels,
// for the same reason CoverageCells' accessible name does: the shape is the
// coarse channel and the words are the exact one.

import { Box, Flex, Text } from "@radix-ui/themes";
import {
  DOMAINS,
  DOMAIN_LABEL,
  type Domain,
} from "../lib/workspaceState";
import { STATE_FOR_STATUS } from "../lib/nomenclature";
import {
  STATUSES,
  type CoverageRow,
  type Status,
} from "../lib/coverageLoader";
import { FILL_FOR_STATUS, type CellFill } from "./CoverageCells";

/** Lit first, half lit next, unlit last: the row reads as a length. */
const FILL_ORDER: readonly CellFill[] = ["authored", "partial", "absent"];

/**
 * The statuses in the order the cells draw them.
 *
 * `STATUSES` is the loader's declaration order, which puts `draft` before
 * `approved`. Reading the tally in that order gave "1 Draft, 2 Approved"
 * beside a row whose cells ran lit-then-half: the words and the shape
 * disagreed about which end was which.
 */
const STATUSES_BY_FILL: readonly Status[] = FILL_ORDER.flatMap((fill) =>
  STATUSES.filter((s) => FILL_FOR_STATUS[s] === fill),
);

export interface DomainTally {
  domain: Domain;
  /** How many components sit at each status. Every status has a key, so a
   *  status that drops to zero reads as zero rather than disappearing. */
  byStatus: Record<Status, number>;
  total: number;
}

export function tally(rows: CoverageRow[]): DomainTally[] {
  return DOMAINS.map((domain) => {
    const byStatus = Object.fromEntries(
      STATUSES.map((s) => [s, 0]),
    ) as Record<Status, number>;
    for (const row of rows) byStatus[row.domains[domain].status] += 1;
    return { domain, byStatus, total: rows.length };
  });
}

/** "53 Approved, 1 Draft". Zero counts are dropped: naming every status on
 *  every row buries the one that moved. */
export function tallyLabel(t: DomainTally): string {
  const parts = STATUSES_BY_FILL.filter((s) => t.byStatus[s] > 0).map(
    (s) => `${t.byStatus[s]} ${STATE_FOR_STATUS[s]}`,
  );
  return parts.length > 0 ? parts.join(", ") : "nothing measured";
}

/** The cells of one row, sorted by how lit they are. */
export function cellsFor(t: DomainTally): CellFill[] {
  // Same order as the label, from the same list, so the two cannot drift.
  const out: CellFill[] = [];
  for (const status of STATUSES_BY_FILL) {
    for (let i = 0; i < t.byStatus[status]; i += 1) {
      out.push(FILL_FOR_STATUS[status]);
    }
  }
  return out;
}

export interface CoverageMatrixProps {
  rows: CoverageRow[];
}

export function CoverageMatrix({ rows }: CoverageMatrixProps) {
  if (rows.length === 0) return null;
  const tallies = tally(rows);
  return (
    <Box data-testid="coverage-matrix">
      {tallies.map((t) => (
        <Flex key={t.domain} align="center" gap="3" py="1" wrap="nowrap">
          <Text
            size="1"
            className="ed-legend"
            style={{ width: 74, flex: "none" }}
          >
            {DOMAIN_LABEL[t.domain]}
          </Text>
          <span
            role="img"
            aria-label={`${DOMAIN_LABEL[t.domain]} across ${t.total} components: ${tallyLabel(t)}`}
            className="ed-readout ed-readout--matrix"
            data-domain={t.domain}
            style={{ flex: "1 1 auto", minWidth: 0 }}
          >
            {cellsFor(t).map((fill, i) => (
              <span
                key={i}
                aria-hidden="true"
                data-fill={fill}
                className={`ed-cell ed-cell--${fill}`}
              />
            ))}
          </span>
          <Text
            size="1"
            color="gray"
            style={{
              // Wide enough for the longest tally the data can produce, and
              // nowrap so it cannot break: "53 Approved, 1 Draft, 31 Empty"
              // wrapped onto two lines at 168px, which left every row's right
              // edge ragged and made a five row figure eight lines tall.
              width: 210,
              flex: "none",
              textAlign: "right",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {tallyLabel(t)}
          </Text>
        </Flex>
      ))}
    </Box>
  );
}

/**
 * The matrix as CSV: one row per component, one column per domain.
 *
 * Exported as data rather than as the figure, because the figure sorts its
 * cells and so cannot say WHICH component is unwritten. Anyone who wants to
 * work from this offline wants the per-component answer, which is the table's
 * content, not the figure's.
 */
export function coverageCsv(rows: CoverageRow[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ["Component", "Slug", ...DOMAINS.map((d) => DOMAIN_LABEL[d])];
  const lines = [header.map(esc).join(",")];
  for (const row of [...rows].sort((a, b) => a.slug.localeCompare(b.slug))) {
    lines.push(
      [
        esc(row.component),
        esc(row.slug),
        ...DOMAINS.map((d) => esc(STATE_FOR_STATUS[row.domains[d].status])),
      ].join(","),
    );
  }
  // A trailing newline: without it the last row is a partial line, and some
  // readers drop it.
  return `${lines.join("\n")}\n`;
}
