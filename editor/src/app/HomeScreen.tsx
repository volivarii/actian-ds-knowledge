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
// Graph counts come from the baked bundle (no fetch); coverage is fetched
// once here and handed to CoverageDashboard via preloadedRows so the
// Explore section doesn't re-fetch.

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
  type Domain,
} from "../lib/coverageLoader";
import { topGaps, usageGapCount } from "../lib/needsAttention";
import { graphNodes, graphEdges } from "../substrate/taxonomyAssets";
import { CoverageDashboard } from "./CoverageDashboard";
import { A11yCoverageDashboard } from "./A11yCoverageDashboard";
import { GraphHealthTab } from "./GraphHealthTab";

export interface HomeScreenProps {
  octokit: Octokit;
  onOpenFile: (path: string) => void;
  /** Opens the global command palette (owned by App). */
  onFindComponent?: () => void;
}

const DOMAIN_LABEL: Record<Domain, string> = {
  content: "Content",
  usage: "Usage",
  design: "Design",
  behavior: "Behavior",
  tokens: "Tokens",
};

const GAP_LIST_LIMIT = 8;

type CoverageState =
  | { kind: "loading" }
  | { kind: "ready"; rows: CoverageRow[] }
  | { kind: "error"; message: string };

function gapActionLabel(item: {
  origin: CoverageRow["origin"];
  missing: Domain[];
}): string {
  if (item.origin === "unstarted") return "Start authoring";
  if (item.missing.includes("usage")) return "Write usage guidance";
  return "Continue authoring";
}

export function HomeScreen({
  octokit,
  onOpenFile,
  onFindComponent,
}: HomeScreenProps) {
  const [coverage, setCoverage] = useState<CoverageState>({ kind: "loading" });
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [exploreTab, setExploreTab] = useState<
    "coverage" | "accessibility" | "relationships"
  >("coverage");
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
  const counts = useMemo(() => (rows ? summarize(rows) : null), [rows]);
  const gaps = useMemo(
    () => (rows ? topGaps(rows, GAP_LIST_LIMIT) : []),
    [rows],
  );
  const usageGaps = rows ? usageGapCount(rows) : null;
  const totalGaps = useMemo(
    () => (rows ? topGaps(rows, rows.length).length : 0),
    [rows],
  );

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
        <Heading size="7" mb="2">
          Everything the design system knows, in one place you can edit.
        </Heading>
        <Text size="3" color="gray" as="p" mb="3">
          Components and their guidance, writing rules, foundations,
          accessibility, and the product context around them. Change anything:
          your edit becomes a pull request that is checked and reviewed before
          it ships, so you cannot break anything.
        </Text>
        <Flex gap="2" wrap="wrap">
          <Badge variant="soft" color="gray" size="2">
            {graphNodes.length} pieces of knowledge
          </Badge>
          <Badge variant="soft" color="gray" size="2">
            {graphEdges.length} connections between them
          </Badge>
          {counts && (
            <Badge variant="soft" color="gray" size="2">
              {counts.authored} of {counts.total} components have authored
              guidance
            </Badge>
          )}
          <Badge variant="soft" color="gray" size="2">
            updated at every merge
          </Badge>
        </Flex>
      </Box>

      {/* ── Start here ─────────────────────────────────────────────────── */}
      <Heading size="4" mb="3">
        Start here
      </Heading>
      <Flex gap="3" mb="5" wrap="wrap">
        <Card style={{ flex: "1 1 260px" }}>
          <Flex direction="column" gap="2" height="100%">
            <Heading size="3">Write missing guidance</Heading>
            <Text size="2" color="gray" style={{ flexGrow: 1 }}>
              {usageGaps == null
                ? "Some components still have no usage guidance. It is the most valuable thing to write."
                : `${usageGaps} ${usageGaps === 1 ? "component has" : "components have"} no usage guidance yet. It is the most valuable thing to write.`}
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
            <Heading size="3">Improve a component</Heading>
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
            <Heading size="3">How your edit ships</Heading>
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
        <Heading size="4" mb="1">
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
                    {gapActionLabel(item)}
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
      <Heading size="4" mb="1">
        Explore the data
      </Heading>
      <Text size="2" color="gray" as="p" mb="3">
        The full picture behind the list above: every component&apos;s status,
        the accessibility coverage, and the health of the connections.
      </Text>
      <Tabs.Root
        value={exploreTab}
        onValueChange={(v) =>
          setExploreTab(v as "coverage" | "accessibility" | "relationships")
        }
      >
        <Tabs.List>
          <Tabs.Trigger value="coverage">Coverage</Tabs.Trigger>
          <Tabs.Trigger value="accessibility">Accessibility</Tabs.Trigger>
          <Tabs.Trigger value="relationships">Relationships</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="coverage">
          {/* Mount only once rows exist — otherwise the dashboard would
              start its own duplicate coverage fetch alongside ours. */}
          {coverage.kind === "ready" ? (
            <CoverageDashboard
              octokit={octokit}
              onOpenFile={onOpenFile}
              preloadedRows={coverage.rows}
            />
          ) : coverage.kind === "error" ? (
            <Callout.Root color="amber" mt="3">
              <Callout.Text>
                Couldn&apos;t load the coverage table: {coverage.message}
              </Callout.Text>
            </Callout.Root>
          ) : (
            <Flex align="center" gap="2" py="4">
              <Spinner />
              <Text size="2" color="gray">
                Loading coverage…
              </Text>
            </Flex>
          )}
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
