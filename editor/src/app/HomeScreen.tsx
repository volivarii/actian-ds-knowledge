// The editor's front door: a hub, not a dashboard.
//
// It holds three things and nothing else: the shape of the backlog in one
// derived sentence, the work worth doing next, and one way into each scope.
//
// THE RULE THAT KEEPS IT A HUB: this screen links, it never analyses. If a
// number needs a sentence to explain it, that sentence belongs on the scope's
// own overview screen. Without that rule this page grew a hero, a coverage
// badge, three action cards, a needs-attention list AND four tab panels, each
// of which restated the statistics above it before showing the table they came
// from.
//
// The four "Explore the data" tabs are gone. Coverage, accessibility, patterns
// and substrate health are screens now (see SCREENS in lib/routes.ts), because
// they were never four of the same thing: three are the overview on top of a
// scope's tree, and the fourth is a diagnostic over the whole substrate.
//
// Coverage resolves through the memoized loadCoverage, so this screen and the
// overviews it links to share one fetch.

import { useEffect, useMemo, useState } from "react";
import type { Octokit } from "@octokit/rest";
import {
  Box,
  Button,
  Callout,
  Flex,
  Heading,
  Spinner,
  Text,
} from "@radix-ui/themes";
import {
  loadCoverage,
  summarize,
  type CoverageRow,
} from "../lib/coverageLoader";
import {
  backlogSentence,
  backlogShape,
  gapCount,
  topGaps,
  type AttentionBand,
} from "../lib/needsAttention";
import { DOMAIN_LABEL } from "../lib/workspaceState";
import { CoverageCells } from "./CoverageCells";
import { COMPONENT_PARENT, SCOPES, SUBSTRATE_HEALTH } from "./scopes";

export interface HomeScreenProps {
  octokit: Octokit;
  onOpenFile: (path: string) => void;
  /** Focuses the header's GlobalSearch input (owned by App), wired through
   *  EditorShell's onFocusSearch. */
  onFindComponent?: () => void;
}

const GAP_LIST_LIMIT = 8;

type CoverageState =
  | { kind: "loading" }
  | { kind: "ready"; rows: CoverageRow[]; unreadable: string[] }
  | { kind: "error"; message: string };

// Labels keyed by the ranking band itself (see needsAttention.band) so the
// button copy can't drift from why the row ranked where it did.
const BAND_ACTION_LABEL: Record<AttentionBand, string> = {
  0: "Write usage guidance",
  1: "Start authoring",
  2: "Continue authoring",
};

export function HomeScreen({
  octokit,
  onOpenFile,
  onFindComponent,
}: HomeScreenProps) {
  const [coverage, setCoverage] = useState<CoverageState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { rows, unreadable } = await loadCoverage(octokit);
        if (!cancelled) setCoverage({ kind: "ready", rows, unreadable });
      } catch (err) {
        if (!cancelled)
          setCoverage({ kind: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [octokit]);

  const rows = coverage.kind === "ready" ? coverage.rows : null;
  const derived = useMemo(
    () =>
      rows
        ? {
            counts: summarize(rows),
            gaps: topGaps(rows, GAP_LIST_LIMIT),
            backlog: backlogShape(rows),
            totalGaps: gapCount(rows),
          }
        : { counts: null, gaps: [], backlog: null, totalGaps: 0 },
    [rows],
  );
  const { counts, gaps, backlog, totalGaps } = derived;

  return (
    <Box p="5" style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* ── The shape of the backlog, in one derived sentence ──────────── */}
      <Box mb="5" style={{ maxWidth: 620 }}>
        <Heading as="h1" size="7" mb="2">
          Author the design system.
        </Heading>
        {coverage.kind === "loading" && (
          <Flex align="center" gap="2" py="2">
            <Spinner />
            <Text size="2" color="gray">
              Reading the substrate…
            </Text>
          </Flex>
        )}
        {coverage.kind === "error" && (
          <Callout.Root color="amber" role="alert">
            <Callout.Text>
              Couldn&apos;t load the guidance status: {coverage.message}
            </Callout.Text>
          </Callout.Root>
        )}
        {counts && (
          <Text size="3" color="gray" as="p">
            {/* Two facts, told apart, and assembled in one pure function. A
                component nobody has started is not missing one domain, it is
                missing all five, and folding the two together made the
                sentence promise a job the list below does not offer. */}
            {backlog ? backlogSentence(backlog) : null}
          </Text>
        )}
        {coverage.kind === "ready" && coverage.unreadable.length > 0 && (
          // The counts above and the list below both leave these out. Saying so
          // here is what keeps "N components" from being a quietly smaller
          // number than the repository holds.
          <Text size="1" color="gray" as="p" mt="2">
            {coverage.unreadable.length} component
            {coverage.unreadable.length === 1 ? "" : "s"} could not be read and{" "}
            {coverage.unreadable.length === 1 ? "is" : "are"} not counted:{" "}
            {coverage.unreadable.join(", ")}.
          </Text>
        )}
      </Box>

      {/* ── Worth doing next ───────────────────────────────────────────── */}
      <Box mb="5">
        <Heading as="h2" size="4" mb="3">
          Worth doing next
        </Heading>
        {coverage.kind === "ready" && gaps.length === 0 && (
          <Callout.Root color="green">
            <Callout.Text>
              Nothing is missing. Every component has its guidance started.
            </Callout.Text>
          </Callout.Root>
        )}
        {coverage.kind === "ready" && gaps.length > 0 && (
          <Box>
            {gaps.map((item) => (
              <Flex
                key={item.slug}
                align="center"
                justify="between"
                gap="3"
                wrap="wrap"
                py="3"
                style={{ borderTop: "1px solid var(--ed-well-edge)" }}
              >
                <Flex align="center" gap="3" wrap="wrap">
                  <Text
                    weight="medium"
                    size="2"
                    style={{ minWidth: 190, display: "inline-block" }}
                  >
                    {item.component}
                  </Text>
                  {/* One readout, not one badge per absent domain. */}
                  <CoverageCells
                    statuses={item.statuses}
                    subject={item.component}
                  />
                  <Text size="1" color="gray">
                    {item.missing.map((d) => DOMAIN_LABEL[d]).join(", ")} not
                    started
                  </Text>
                </Flex>
                <Button
                  variant="soft"
                  size="1"
                  onClick={() => onOpenFile(item.target)}
                >
                  {BAND_ACTION_LABEL[item.band]}
                </Button>
              </Flex>
            ))}
            {totalGaps > gaps.length && (
              // A control and a sentence on one line rendered as small text
              // jammed after a full stop, so the control did not read as one.
              <Flex align="center" gap="3" mt="3" wrap="wrap">
                <Text size="2" color="gray">
                  {totalGaps - gaps.length} more
                </Text>
                <Button
                  variant="soft"
                  size="1"
                  onClick={() => onOpenFile(COMPONENT_PARENT.path)}
                >
                  See the whole matrix
                </Button>
              </Flex>
            )}
          </Box>
        )}
      </Box>

      {/* ── One way into each scope ────────────────────────────────────── */}
      <Box>
        <Heading as="h2" size="4" mb="1">
          Scopes
        </Heading>
        <Text size="2" color="gray" as="p" mb="3">
          Each holds one part of the substrate.
        </Text>
        {SCOPES.map((scope) => {
          const overview = scope.overview;
          return (
          <Flex
            key={scope.key}
            align="center"
            justify="between"
            gap="3"
            wrap="wrap"
            py="3"
            style={{ borderTop: "1px solid var(--ed-well-edge)" }}
          >
            <Box style={{ minWidth: 190 }}>
              <Text weight="medium" size="2" as="div">
                {scope.label}
              </Text>
              <Text size="1" color="gray" as="div">
                {scope.holds}
              </Text>
            </Box>
            {overview ? (
              <Button
                variant="soft"
                size="1"
                onClick={() => onOpenFile(overview)}
              >
                Open the overview
              </Button>
            ) : (
              // Shown rather than hidden: a scope with no overview yet is a
              // gap in the structure, and hiding it makes the structure look
              // finished.
              <Text size="1" color="gray">
                No overview yet
              </Text>
            )}
          </Flex>
          );
        })}
        <Flex
          align="center"
          justify="between"
          gap="3"
          wrap="wrap"
          py="3"
          style={{
            borderTop: "1px solid var(--ed-well-edge)",
            borderBottom: "1px solid var(--ed-well-edge)",
          }}
        >
          <Box style={{ minWidth: 190 }}>
            <Text weight="medium" size="2" as="div">
              {SUBSTRATE_HEALTH.label}
            </Text>
            <Text size="1" color="gray" as="div">
              {SUBSTRATE_HEALTH.holds}
            </Text>
          </Box>
          <Button
            variant="soft"
            size="1"
            onClick={() => onOpenFile(SUBSTRATE_HEALTH.overview)}
          >
            Open the overview
          </Button>
        </Flex>
        <Flex mt="4" gap="3" wrap="wrap">
          <Button
            variant="outline"
            size="1"
            onClick={() => onFindComponent?.()}
            disabled={!onFindComponent}
          >
            Find a component
          </Button>
        </Flex>
      </Box>
    </Box>
  );
}
