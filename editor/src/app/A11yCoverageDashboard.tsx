import { useEffect, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Box, Callout, Flex, Spinner, Text } from "@radix-ui/themes";
import { loadCoverage } from "../lib/coverageLoader";
import {
  computeTopicCoverage,
  loadCategoryPatternRefs,
  thinComponents,
  type TopicCoverage,
  type ThinComponent,
} from "../lib/a11yCoverage";
import { A11yCoverageView } from "./A11yCoverageView";

export interface A11yCoverageDashboardProps {
  octokit: Octokit;
  onOpenFile: (path: string) => void;
}

export function A11yCoverageDashboard({ octokit, onOpenFile }: A11yCoverageDashboardProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; topics: TopicCoverage[]; thin: ThinComponent[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rows, categoryRefs] = await Promise.all([
          loadCoverage(octokit),
          loadCategoryPatternRefs(octokit),
        ]);
        if (cancelled) return;
        setState({
          kind: "ready",
          topics: computeTopicCoverage(rows, categoryRefs),
          thin: thinComponents(rows),
        });
      } catch (err) {
        if (!cancelled) setState({ kind: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [octokit]);

  if (state.kind === "loading") {
    return (
      <Box p="6">
        <Flex align="center" gap="2">
          <Spinner />
          <Text size="2" color="gray">Loading a11y coverage…</Text>
        </Flex>
      </Box>
    );
  }
  if (state.kind === "error") {
    return (
      <Box p="6">
        <Callout.Root color="red">
          <Callout.Text>Failed to load a11y coverage: {state.message}</Callout.Text>
        </Callout.Root>
      </Box>
    );
  }
  return <A11yCoverageView topics={state.topics} thin={state.thin} onOpenFile={onOpenFile} />;
}
