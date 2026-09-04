// The overview on top of the Components tree: per-domain, per-component
// status, as a figure first and a table second.
//
// Reached at `#/coverage`, from the sidebar above the component list and from
// the hub. Pure read and navigate; the only write affordance is "Start
// authoring" on ghost rows, which adds a stub _meta.yml to the submission
// cart for batch PR.
//
// Row sources (T1.5):
//   - authored (origin="authored"): every components/src/<slug>/_meta.yml
//   - unstarted (origin="unstarted"): every DS Kit registry component
//     with no _meta.yml yet (excluding icons / logos / illustrations /
//     uncategorized / local / white-label)
//
// Cell click routing (see cellTarget in coverageLoader.ts):
//   - approved/draft → opens components/src/<slug>/<domain>.md
//   - inherited → opens components/src/categories/<category>.md
//   - not-started → opens components/src/<slug>/_meta.yml
//   - row header (component name, authored) → opens _meta.yml
//   - row header (component name, unstarted) → Start authoring action

import { useEffect, useMemo, useState } from "react";
import type { Octokit } from "@octokit/rest";
import {
  Badge,
  Box,
  Button,
  Callout,
  Flex,
  Heading,
  Spinner,
  Table,
  Text,
} from "@radix-ui/themes";
import {
  cellTarget,
  DOMAINS,
  loadCoverage,
  summarize,
  type CoverageRow,
  type Status,
} from "../lib/coverageLoader";
import {
  STATE_FOR_STATUS,
  THING_LABEL,
  SLOT_LABEL,
} from "../lib/nomenclature";
import { submissionCartSingleton } from "../drafts/store-instance";
import { useCart } from "../drafts/useCart";
import { measure, measuredToday } from "../lib/measure";
import { componentSlotRecords, componentSlotsFor } from "../lib/slots";
import { loadCapturedSlugs } from "../lib/loadMediaIndex";
import { DOMAIN_LABEL } from "../lib/workspaceState";
import { coverageSentence, largestGap } from "../lib/needsAttention";
import { MeterList } from "./MeterList";
import { CoverageMatrix, coverageCsv } from "./CoverageMatrix";
import { SCREEN_TITLE } from "../lib/routes";
import { downloadCsv } from "../lib/download";

export interface CoverageDashboardProps {
  octokit: Octokit;
  onOpenFile: (path: string) => void;
}

const STATUS_COLOR: Record<Status, "gray" | "amber" | "blue" | "green"> = {
  "not-started": "gray",
  draft: "amber",
  approved: "green",
  inherited: "blue",
};

// One vocabulary with the workspace. `not-started` used to render as an
// em-dash here, which is a state a reader cannot read.
const STATUS_LABEL: Record<Status, string> = STATE_FOR_STATUS;

export function CoverageDashboard({
  octokit,
  onOpenFile,
}: CoverageDashboardProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; rows: CoverageRow[]; unreadable: string[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const cartEntries = useCart(submissionCartSingleton);
  const cartedPaths = useMemo(
    () => new Set(cartEntries.map((e) => e.path)),
    [cartEntries],
  );

  // Three states, not two. "Loading" and "cannot be measured" are different
  // facts and a nullable Set conflates them: the Meters render as soon as the
  // coverage rows are ready, which can be BEFORE the media index resolves, so a
  // two-state version dropped the Capture Meter for a transient reason and
  // popped it in a moment later with nothing said. Omitting a measure without
  // saying why is the same defect as reporting `0 of 73`.
  const [captures, setCaptures] = useState<
    | { kind: "loading" }
    | { kind: "ready"; slugs: Set<string> }
    | { kind: "failed" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { rows, unreadable } = await loadCoverage(octokit);
        if (!cancelled) setState({ kind: "ready", rows, unreadable });
      } catch (err) {
        if (!cancelled)
          setState({ kind: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [octokit]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCaptures({ kind: "loading" });
      try {
        const slugs = await loadCapturedSlugs(octokit);
        if (!cancelled) setCaptures({ kind: "ready", slugs });
      } catch {
        // The table is the point of this screen and must still render; only
        // the Capture Meter drops out.
        if (!cancelled) setCaptures({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [octokit]);

  const counts = useMemo(
    () => (state.kind === "ready" ? summarize(state.rows) : null),
    [state],
  );

  const meters = useMemo(() => {
    // Wait for BOTH. Rendering while the index is still in flight shows a table
    // of Meters that silently excludes one and then changes shape.
    if (state.kind !== "ready" || captures.kind === "loading") return null;
    // `state.rows` holds only rows that were READ: the loader moves an
    // unreadable `_meta.yml` into `state.unreadable` before any screen sees
    // it, so this count and the table below it cannot disagree about the
    // denominator. The note under the Meters names what was left out.
    // Only what the matrix does not already show. The five guidance domains
    // are the matrix, cell for cell, and rendering them again as ratios
    // directly beneath it is the restatement this screen is being cleared of.
    // Capture is a different measure, so it stays.
    return measure(
      componentSlotRecords(
        state.rows,
        captures.kind === "ready" ? captures.slugs : new Set<string>(),
      ),
      componentSlotsFor(captures.kind === "ready").filter(
        (slot) => slot.key === "capture",
      ),
      measuredToday(),
    );
  }, [state, captures]);

  // The verb for the finding the sentence states. A page that says "Tokens is
  // the backlog" and then offers only "Export as CSV" has named a job and
  // handed the reader a spreadsheet: export is a verb about the data, not
  // about the work. Derived from the same `largestGap` over the same authored
  // rows, so the button and the sentence cannot name different domains.
  const pass = useMemo(() => {
    if (state.kind !== "ready") return null;
    const authored = state.rows.filter((r) => r.origin === "authored");
    const worst = largestGap(authored);
    if (!worst) return null;
    const first = authored.find(
      (r) => r.domains[worst.domain].status === "not-started",
    );
    // largestGap counts them, so one exists; if the two ever disagree, offer
    // nothing rather than a button that opens the wrong file.
    if (!first) return null;
    return {
      domain: worst.domain,
      open: worst.open,
      component: first.component,
      target: cellTarget(first, worst.domain),
    };
  }, [state]);

  // The page's name renders in every state. While it lived below the early
  // returns, a reader arriving during the fetch found a page with no h1, and
  // the fetch here is 30 to 90 GitHub calls.
  const heading = (
    <Heading as="h1" size="5" mb="1">
      {SCREEN_TITLE.coverage}
    </Heading>
  );

  if (state.kind === "loading") {
    return (
      <Box p="5" style={{ maxWidth: 1100, margin: "0 auto" }}>
        {heading}
        <Flex align="center" gap="2" mt="3">
          <Spinner />
          <Text size="2" color="gray">
            Loading coverage…
          </Text>
        </Flex>
      </Box>
    );
  }

  if (state.kind === "error") {
    return (
      <Box p="5" style={{ maxWidth: 1100, margin: "0 auto" }}>
        {heading}
        <Callout.Root color="red" role="alert" mt="3">
          <Callout.Text>Failed to load coverage: {state.message}</Callout.Text>
        </Callout.Root>
      </Box>
    );
  }

  const { rows } = state;

  function startAuthoring(row: CoverageRow) {
    // Open the workspace — pure navigation, no cart mutation. Staging
    // happens lazily the first time the user takes a concrete action
    // (Write a domain, or Edit metadata) inside the workspace.
    onOpenFile(`workspace/${row.slug}`);
  }

  return (
    <Box p="5" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {heading}
      <Text size="2" color="gray" as="p" mb="4">
        {coverageSentence(rows)}
      </Text>

      {/* The figure, before any number that describes it. */}
      <Box mb="4">
        <CoverageMatrix rows={rows} />
      </Box>

      <Flex gap="2" mb="4" wrap="wrap">
        {pass && (
          <Button
            size="1"
            onClick={() => onOpenFile(pass.target)}
            title={`Opens ${pass.component}, the first of ${pass.open} with no ${DOMAIN_LABEL[pass.domain]} guidance`}
          >
            Start the {DOMAIN_LABEL[pass.domain]} pass
          </Button>
        )}
        <Button
          variant="soft"
          size="1"
          onClick={() => downloadCsv(coverageCsv(rows), "component-coverage")}
        >
          Export as CSV
        </Button>
      </Flex>

      {meters && (
        <Box mb="4" mt="3">
          <MeterList
            groupKey="component"
            title={THING_LABEL.component}
            meters={meters}
          />
          {state.unreadable.length > 0 && (
            // Named, not counted: "1 component could not be read" sends a
            // reader to scan 73 rows for the one that is missing.
            <Text size="1" color="gray" as="p" mt="2">
              {state.unreadable.length} component
              {state.unreadable.length === 1 ? "" : "s"} could not be read and{" "}
              {state.unreadable.length === 1 ? "is" : "are"} not counted above
              or in the table: {state.unreadable.join(", ")}.
            </Text>
          )}
          {captures.kind === "failed" && (
            // The comment on `captures` says omitting a measure without saying
            // why is the same defect as reporting `0 of 73`. Dropping the Slot
            // silently WAS that omission: a reader who saw a Capture Meter
            // yesterday and not today could not tell a measure that failed from
            // one that was deleted.
            <Text size="1" color="gray" as="p" mt="2">
              {SLOT_LABEL.capture} not measured: the media index could not be
              read.
            </Text>
          )}
        </Box>
      )}
      {/* The table is closed at rest, and that is the whole point of this
          screen now.

          It restates the figure above it cell for cell: five columns of
          coloured words for five rows of cells, 425 badges under a drawing of
          the same 85 rows. The badges are not deleted, because they carry
          affordances the figure cannot: a 9px matrix cell is below the 24px
          target floor (WCAG 2.5.8), so the figure can never be the thing you
          click to open one component's Design guidance. Closed by default is
          the honest resolution: the page at rest is the figure, and the
          per-cell route is one keystroke away for whoever wants it.

          Native details/summary rather than a Radix disclosure: it is keyboard
          operable and announced as expandable with no JavaScript and no state
          of ours to get wrong. */}
      <details data-testid="coverage-table-disclosure">
        <summary style={{ cursor: "pointer" }}>
          <Text size="2" color="gray">
            All {rows.length} components, one row each
          </Text>
        </summary>

        <Text size="2" color="gray" mb="3" mt="3" as="p">
          Click a component name to open its details, click a status cell to
          edit that guidance, or click <em>Start authoring</em> on an unstarted
          row to begin.
        </Text>

        <Table.Root variant="surface" size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Component</Table.ColumnHeaderCell>
              {DOMAINS.map((d) => (
                <Table.ColumnHeaderCell key={d}>
                  {DOMAIN_LABEL[d]}
                </Table.ColumnHeaderCell>
              ))}
              <Table.ColumnHeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={2 + DOMAINS.length}>
                  <Text color="gray">No components found.</Text>
                </Table.Cell>
              </Table.Row>
            )}
            {rows.map((row) => {
              const isGhost = row.origin === "unstarted";
              const metaPath = `components/src/${row.slug}/_meta.yml`;
              const staged = cartedPaths.has(metaPath);
              return (
                <Table.Row key={row.slug} style={{ opacity: isGhost ? 0.78 : 1 }}>
                  <Table.RowHeaderCell>
                    <Text
                      weight="medium"
                      style={{
                        cursor: isGhost ? "default" : "pointer",
                        fontStyle: isGhost ? "italic" : "normal",
                      }}
                      onClick={() => {
                        if (!isGhost) onOpenFile(metaPath);
                      }}
                      title={
                        isGhost
                          ? `Unstarted (registry: ${row.registryKey})`
                          : `Open ${row.slug}/_meta.yml`
                      }
                    >
                      {row.component}
                    </Text>
                    {row.category && (
                      <Text size="1" color="gray" as="div">
                        {row.category}
                      </Text>
                    )}
                  </Table.RowHeaderCell>
                  {DOMAINS.map((d) => {
                    const entry = row.domains[d];
                    const target = cellTarget(row, d);
                    return (
                      <Table.Cell
                        key={d}
                        style={{ cursor: isGhost ? "default" : "pointer" }}
                        onClick={() => {
                          if (!isGhost) onOpenFile(target);
                        }}
                        title={
                          isGhost
                            ? "Click Start authoring to add a stub _meta.yml"
                            : // The raw substrate key used to reach the tooltip
                              // of the very cell whose badge says "Empty".
                              `Status: ${STATUS_LABEL[entry.status] ?? entry.status} → ${target}`
                        }
                      >
                        <Badge
                          color={STATUS_COLOR[entry.status]}
                          variant="soft"
                          size="1"
                        >
                          {STATUS_LABEL[entry.status]}
                        </Badge>
                      </Table.Cell>
                    );
                  })}
                  <Table.Cell>
                    {isGhost && (
                      <Button
                        size="1"
                        variant={staged ? "soft" : "outline"}
                        color={staged ? "gray" : "indigo"}
                        disabled={staged}
                        onClick={() => startAuthoring(row)}
                        title={
                          staged
                            ? "Already staged in the batch"
                            : "Stage a stub _meta.yml in the submission batch"
                        }
                      >
                        {staged ? "Staged" : "Start authoring"}
                      </Button>
                    )}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </details>
    </Box>
  );
}
