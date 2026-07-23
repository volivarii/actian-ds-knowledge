// The editor's front door — renders when EditorShell.activePath is null.
//
// One page that answers, in order: what this is (hero), where to start
// (three action cards), what most needs writing (needs-attention list),
// and the full data (the former landing tabs, absorbed here as an
// "Explore the data" section). Design rules it encodes:
//   - every answer ends in a click that starts an edit
//   - plain author language, no repo/graph jargon
//   - honest status (real counts, gaps shown as a to-do list)
//   - can't-break-anything messaging on the editing loop
//
// Coverage (the hero's "N of M components have authored guidance" badge,
// and the needs-attention list) resolves through the memoized loadCoverage,
// so this screen and the Explore dashboards all share one fetch.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Octokit } from "@octokit/rest";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Spinner,
  Tabs,
  Text,
} from "@radix-ui/themes";
import {
  loadCoverage,
  summarize,
  type CoverageRow,
} from "../lib/coverageLoader";
import {
  authoredUsageGapCount,
  gapCount,
  topGaps,
  type AttentionBand,
} from "../lib/needsAttention";
import { DOMAIN_LABEL } from "../lib/workspaceState";
import { CoverageDashboard } from "./CoverageDashboard";
import { A11yCoverageDashboard } from "./A11yCoverageDashboard";
import { GraphHealthTab } from "./GraphHealthTab";

export type ExploreTab = "coverage" | "accessibility" | "relationships";

export interface HomeScreenProps {
  octokit: Octokit;
  onOpenFile: (path: string) => void;
  /** Focuses the header's GlobalSearch input (owned by App), wired through
   *  EditorShell's onFocusSearch. */
  onFindComponent?: () => void;
  /** Optional controlled Explore-tab state (owned by EditorShell so the
   *  chosen tab survives navigating into a file and back — the behavior
   *  the old landing tabs had). Uncontrolled when omitted. */
  exploreTab?: ExploreTab;
  onExploreTabChange?: (tab: ExploreTab) => void;
}

const GAP_LIST_LIMIT = 8;

type CoverageState =
  | { kind: "loading" }
  | { kind: "ready"; rows: CoverageRow[] }
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
  exploreTab: exploreTabProp,
  onExploreTabChange,
}: HomeScreenProps) {
  const [coverage, setCoverage] = useState<CoverageState>({ kind: "loading" });
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [internalExploreTab, setInternalExploreTab] =
    useState<ExploreTab>("coverage");
  const exploreTab = exploreTabProp ?? internalExploreTab;
  const setExploreTab = onExploreTabChange ?? setInternalExploreTab;
  const needsAttentionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadCoverage(octokit);
        if (!cancelled) setCoverage({ kind: "ready", rows });
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
            usageGaps: authoredUsageGapCount(rows),
            totalGaps: gapCount(rows),
          }
        : { counts: null, gaps: [], usageGaps: null, totalGaps: 0 },
    [rows],
  );
  const { counts, gaps, usageGaps, totalGaps } = derived;

  const scrollToNeedsAttention = () => {
    needsAttentionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <Box p="5" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <Box mb="5" style={{ maxWidth: 680 }}>
        <Heading as="h1" size="7" mb="2">
          Browse and edit the design system.
        </Heading>
        <Text size="3" color="gray" as="p" mb="3">
          Its components, guidance, foundations, accessibility, and the products
          that use them. Every edit opens a pull request that is reviewed before
          it ships.
        </Text>
        {counts && (
          <Flex gap="2" wrap="wrap">
            <Badge variant="soft" color="gray" size="2">
              {counts.authored} of {counts.total} components have authored
              guidance
            </Badge>
          </Flex>
        )}
      </Box>

      {/* ── Start here ─────────────────────────────────────────────────── */}
      <Heading as="h2" size="4" mb="3">
        Start here
      </Heading>
      <Flex gap="3" mb="5" wrap="wrap">
        <Card style={{ flex: "1 1 260px" }}>
          <Flex direction="column" gap="2" height="100%">
            <Heading as="h3" size="3">
              Write missing guidance
            </Heading>
            <Text size="2" color="gray" style={{ flexGrow: 1 }}>
              {usageGaps == null
                ? "Some components still need usage guidance. It is the most valuable thing to write."
                : usageGaps === 0
                  ? "Every started component's usage guidance is underway. See below for anything else that needs a hand."
                  : `${usageGaps} started ${usageGaps === 1 ? "component still lacks" : "components still lack"} usage guidance. It is the most valuable thing to write.`}
            </Text>
            <Box>
              <Button variant="solid" onClick={scrollToNeedsAttention}>
                See what needs attention
              </Button>
            </Box>
          </Flex>
        </Card>
        <Card style={{ flex: "1 1 260px" }}>
          <Flex direction="column" gap="2" height="100%">
            <Heading as="h3" size="3">
              Improve a component
            </Heading>
            <Text size="2" color="gray" style={{ flexGrow: 1 }}>
              Jump straight to any component and edit its guidance, words, or
              metadata.
            </Text>
            <Box>
              <Button
                variant="soft"
                onClick={() => onFindComponent?.()}
                disabled={!onFindComponent}
              >
                Find a component
              </Button>
            </Box>
          </Flex>
        </Card>
        <Card style={{ flex: "1 1 260px" }}>
          <Flex direction="column" gap="2" height="100%">
            <Heading as="h3" size="3">
              How your edit ships
            </Heading>
            <Text size="2" color="gray" style={{ flexGrow: 1 }}>
              See what happens between pressing Submit and your change going
              live.
            </Text>
            <Box>
              <Button
                variant="soft"
                onClick={() => setHowItWorksOpen((v) => !v)}
                aria-expanded={howItWorksOpen}
              >
                {howItWorksOpen ? "Hide the steps" : "Show the steps"}
              </Button>
            </Box>
          </Flex>
        </Card>
      </Flex>

      {/* ── How it works (disclosure) ──────────────────────────────────── */}
      {howItWorksOpen && (
        <Card mb="5" variant="surface">
          <Flex gap="4" wrap="wrap">
            {[
              {
                n: "1",
                title: "You edit a page",
                body: "Forms, rich text, or raw markdown. Drafts save locally as you type; nothing leaves your browser until you submit.",
              },
              {
                n: "2",
                title: "A pull request opens",
                body: "Your batched changes become one reviewable pull request on GitHub. Nothing ships until someone approves it.",
              },
              {
                n: "3",
                title: "The system does the rest",
                body: "Automated checks validate the change, and once merged, everything derived from it (docs, data, the connection map) updates by itself.",
              },
            ].map((step) => (
              <Flex key={step.n} gap="2" style={{ flex: "1 1 240px" }}>
                <Badge variant="solid" radius="full" size="2">
                  {step.n}
                </Badge>
                <Box>
                  <Text size="2" weight="medium" as="div">
                    {step.title}
                  </Text>
                  <Text size="2" color="gray" as="div">
                    {step.body}
                  </Text>
                </Box>
              </Flex>
            ))}
          </Flex>
        </Card>
      )}

      {/* ── Needs attention ────────────────────────────────────────────── */}
      <Box ref={needsAttentionRef} mb="5">
        <Heading as="h2" size="4" mb="1">
          Needs attention
        </Heading>
        <Text size="2" color="gray" as="p" mb="3">
          The most valuable writing right now: components designers use that are
          missing guidance.
        </Text>
        {coverage.kind === "loading" && (
          <Flex align="center" gap="2" py="3">
            <Spinner />
            <Text size="2" color="gray">
              Checking what needs attention…
            </Text>
          </Flex>
        )}
        {coverage.kind === "error" && (
          <Callout.Root color="amber">
            <Callout.Text>
              Couldn&apos;t load the guidance status: {coverage.message}
            </Callout.Text>
          </Callout.Root>
        )}
        {coverage.kind === "ready" && gaps.length === 0 && (
          <Callout.Root color="green">
            <Callout.Text>
              Nothing is missing. Every component has its guidance started.
            </Callout.Text>
          </Callout.Root>
        )}
        {coverage.kind === "ready" && gaps.length > 0 && (
          <Flex direction="column" gap="2">
            {gaps.map((item) => (
              <Card key={item.slug}>
                <Flex align="center" justify="between" gap="3" wrap="wrap">
                  <Box>
                    <Text weight="medium" as="div">
                      {item.component}
                    </Text>
                    <Flex gap="1" mt="1" wrap="wrap">
                      {item.missing.map((d) => (
                        <Badge key={d} variant="soft" color="gray" size="1">
                          {DOMAIN_LABEL[d]} missing
                        </Badge>
                      ))}
                    </Flex>
                  </Box>
                  <Button
                    variant="soft"
                    size="1"
                    onClick={() => onOpenFile(item.target)}
                  >
                    {BAND_ACTION_LABEL[item.band]}
                  </Button>
                </Flex>
              </Card>
            ))}
            {totalGaps > gaps.length && (
              <Text size="2" color="gray">
                {totalGaps - gaps.length} more in the coverage table below.
              </Text>
            )}
          </Flex>
        )}
      </Box>

      {/* ── Explore the data (the absorbed landing tabs) ───────────────── */}
      <Heading as="h2" size="4" mb="1">
        Explore the data
      </Heading>
      <Text size="2" color="gray" as="p" mb="3">
        The full picture behind the list above: every component&apos;s status,
        the accessibility coverage, and the health of the connections.
      </Text>
      <Tabs.Root
        value={exploreTab}
        onValueChange={(v) => setExploreTab(v as ExploreTab)}
      >
        <Tabs.List>
          <Tabs.Trigger value="coverage">Coverage</Tabs.Trigger>
          <Tabs.Trigger value="accessibility">Accessibility</Tabs.Trigger>
          <Tabs.Trigger value="relationships">Relationships</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="coverage">
          {/* Self-loads through the memoized loadCoverage — resolves from
              the same cached promise as this screen's own fetch. */}
          <CoverageDashboard octokit={octokit} onOpenFile={onOpenFile} />
        </Tabs.Content>
        <Tabs.Content value="accessibility">
          <A11yCoverageDashboard octokit={octokit} onOpenFile={onOpenFile} />
        </Tabs.Content>
        <Tabs.Content value="relationships">
          <GraphHealthTab onOpenFile={onOpenFile} />
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  );
}
