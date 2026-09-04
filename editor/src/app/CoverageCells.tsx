// The editor's status readout: one cell per guidance domain.
//
// Five cells, always in DOMAINS order, three lit levels. It replaces the row
// of "<Domain> missing" badges the front door used to carry: eight rows of
// five badges is forty phrases to read, and all forty said the same word.
//
// TWO CHANNELS, DELIBERATELY UNEQUAL IN PRECISION.
//   - The cells are the fast channel. They collapse `draft` and `inherited`
//     into one half-lit level, because at a glance the useful question is
//     "is this written, partly written, or not written".
//   - The accessible name is the exact channel. It names the real status of
//     every domain, through the same STATE_FOR_STATUS map the tables and
//     badges read, so nothing here invents a second vocabulary.
// A reader who cannot use the shape loses no information, and a reader who
// can gets the shape without giving up the detail.
//
// NOT INTERACTIVE, on purpose. A cell is 9px wide, far below the 24px target
// floor in WCAG 2.5.8, so making cells clickable would trade a real
// accessibility failure for a small convenience. Every surface that shows a
// readout carries a real control beside it.

import { DOMAINS, DOMAIN_LABEL, type Domain } from "../lib/workspaceState";
import { STATE_FOR_STATUS } from "../lib/nomenclature";
import type { Status } from "../lib/coverageLoader";

/** How lit a cell is. Three levels, not four: see the note above. */
export type CellFill = "authored" | "partial" | "absent";

/**
 * Every substrate status, mapped to a lit level.
 *
 * `inherited` is half lit rather than lit: the component is standing on its
 * category's default, which is a real answer but not one anybody wrote for
 * this component. Rendering it as authored would have made 50 of 54 design
 * domains look finished.
 */
export const FILL_FOR_STATUS: Record<Status, CellFill> = {
  approved: "authored",
  draft: "partial",
  inherited: "partial",
  "not-started": "absent",
};

export type DomainStatuses = Record<Domain, Status>;

/**
 * The readout's accessible name: the exact status of all five domains.
 *
 * Built from DOMAIN_LABEL and STATE_FOR_STATUS rather than literals, so a
 * renamed domain or a renamed state reaches the screen reader and the visible
 * table in the same commit.
 */
export function coverageCellsLabel(
  statuses: DomainStatuses,
  subject?: string,
): string {
  const parts = DOMAINS.map(
    (d) => `${DOMAIN_LABEL[d]} ${STATE_FOR_STATUS[statuses[d]]}`,
  ).join(", ");
  return subject ? `${subject}: ${parts}` : parts;
}

export interface CoverageCellsProps {
  statuses: DomainStatuses;
  /** Names what the readout is about, so its accessible name reads as a
   *  statement about a thing rather than five bare pairs. */
  subject?: string;
  /** Extra classes, for the density variants declared in instrument.css. */
  className?: string;
}

export function CoverageCells({
  statuses,
  subject,
  className,
}: CoverageCellsProps) {
  return (
    <span
      role="img"
      aria-label={coverageCellsLabel(statuses, subject)}
      className={className ? `ed-readout ${className}` : "ed-readout"}
      data-testid="coverage-cells"
    >
      {DOMAINS.map((domain) => (
        <span
          key={domain}
          aria-hidden="true"
          data-domain={domain}
          data-fill={FILL_FOR_STATUS[statuses[domain]]}
          className={`ed-cell ed-cell--${FILL_FOR_STATUS[statuses[domain]]}`}
        />
      ))}
    </span>
  );
}
