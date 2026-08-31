// Patterns tab on the editor's front door.
//
// App-first, because that is how the substrate is shaped: an app defines use
// cases (an audience, its jobs, and the patterns that serve them), a pattern
// claims one or more apps, and a captured page recipe names its pattern, its
// app and the surface it was taken from. A flat list with an app filter would
// show only the weakest of those three.
//
// Pure read and navigate. A row opens the pattern's source markdown; a capture
// chip opens the recipe JSON. Nothing here writes, and patterns carry no status
// field, so there is no promote control to mirror the guidance domains.

import { useEffect, useMemo, useState } from "react";
import type { Octokit } from "@octokit/rest";
import {
  Badge,
  Box,
  Callout,
  Flex,
  Heading,
  Separator,
  Spinner,
  Table,
  Text,
} from "@radix-ui/themes";
import {
  loadPatternIndex,
  type AppSection,
  type PatternIndex,
  type PatternRow,
} from "../lib/patternIndex";

export interface PatternsDashboardProps {
  octokit: Octokit;
  onOpenFile: (path: string) => void;
}

const PATTERN_SRC = (slug: string) => `app-context/src/patterns/${slug}.md`;
const RECIPE_SRC = (slug: string) => `app-context/src/recipes/${slug}.json`;

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function PatternTable({
  rows,
  onOpenFile,
  emptyText,
}: {
  rows: PatternRow[];
  onOpenFile: (path: string) => void;
  emptyText: string;
}) {
  return (
    <Table.Root variant="surface" size="1">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Pattern</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Apps</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>When to use it</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Components</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Captures</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.length === 0 && (
          <Table.Row>
            <Table.Cell colSpan={5}>
              <Text color="gray">{emptyText}</Text>
            </Table.Cell>
          </Table.Row>
        )}
        {rows.map((p) => (
          <Table.Row key={p.slug}>
            <Table.RowHeaderCell>
              <Text
                weight="medium"
                style={{ cursor: "pointer" }}
                onClick={() => onOpenFile(PATTERN_SRC(p.slug))}
              >
                {p.label}
              </Text>
              <Text size="1" color="gray" as="p">
                {p.slug}
              </Text>
            </Table.RowHeaderCell>
            <Table.Cell>
              <Flex gap="1" wrap="wrap">
                {p.apps.map((a) => (
                  <Badge key={a} variant="soft" color="gray" size="1">
                    {a}
                  </Badge>
                ))}
              </Flex>
            </Table.Cell>
            <Table.Cell>
              <Text size="1" title={p.when ?? undefined}>
                {p.when ? (
                  truncate(p.when, 150)
                ) : (
                  <Text color="amber">no when clause</Text>
                )}
              </Text>
            </Table.Cell>
            <Table.Cell>
              <Text size="1" title={p.components.join(", ")}>
                {p.components.length}
              </Text>
            </Table.Cell>
            <Table.Cell>
              {p.recipes.length === 0 ? (
                <Text size="1" color="gray">
                  —
                </Text>
              ) : (
                <Flex gap="1" wrap="wrap">
                  {p.recipes.map((r) => (
                    <Badge
                      key={r.slug}
                      variant="soft"
                      color="green"
                      size="1"
                      // NOT clickable. A recipe is JSON, and EditorShell routes
                      // only _meta.yml, the app-context frontmatter forms and
                      // plain markdown, so opening one lands on the refusal
                      // banner. A chip that navigates to a dead end reads as
                      // broken; making recipes openable here is its own change
                      // (the editor has no JSON surface at all today).
                      title={`${r.surface ?? r.slug}${
                        r.capturedOn ? `, captured ${r.capturedOn}` : ""
                      }. ${RECIPE_SRC(r.slug)}, not editable in the editor yet.`}
                    >
                      {/* The surface, not the app: an app-named chip here reads
                          identically to the app badges two columns left, and
                          where a capture came from is the fact worth showing.
                          Truncated because a real surface path runs to six
                          segments; the whole path is on the title. */}
                      {truncate(r.surface ?? r.slug, 42)}
                    </Badge>
                  ))}
                </Flex>
              )}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

function AppBlock({
  app,
  onOpenFile,
}: {
  app: AppSection;
  onOpenFile: (path: string) => void;
}) {
  const reached = app.useCases.reduce((n, u) => n + u.patterns.length, 0);
  return (
    <Box mb="6">
      <Flex align="baseline" gap="3" mb="1" wrap="wrap">
        <Heading as="h4" size="4">
          {app.label}
        </Heading>
        <Text
          size="1"
          color="gray"
          style={{ cursor: "pointer" }}
          onClick={() => onOpenFile(`app-context/src/apps/${app.slug}.md`)}
        >
          {app.useCases.length} use case{app.useCases.length === 1 ? "" : "s"} ·{" "}
          {reached} pattern{reached === 1 ? "" : "s"} named ·{" "}
          {app.unreachedPatterns.length} claimed but unnamed
        </Text>
        {app.sidebar.length === 0 ? (
          <Badge color="amber" variant="soft" size="1">
            no sidebar recorded
          </Badge>
        ) : (
          <Badge color="gray" variant="soft" size="1">
            {app.sidebar.length} sidebar entries
          </Badge>
        )}
      </Flex>

      {app.useCases.map((uc, i) => (
        <Box key={i} mb="3">
          <Flex gap="2" align="baseline" wrap="wrap" mb="1">
            <Text size="2" weight="medium">
              {uc.jobs[0] ?? "Use case"}
            </Text>
            {uc.audience.map((a) => (
              <Badge key={a} variant="outline" color="gray" size="1">
                {a}
              </Badge>
            ))}
          </Flex>
          {uc.jobs.length > 1 && (
            <Text size="1" color="gray" as="p" mb="1">
              Also: {uc.jobs.slice(1).join(" · ")}
            </Text>
          )}
          {uc.missingPatterns.length > 0 && (
            <Callout.Root color="red" size="1" mb="2">
              <Callout.Text>
                Names {uc.missingPatterns.length} pattern
                {uc.missingPatterns.length === 1 ? "" : "s"} that do not exist:{" "}
                {uc.missingPatterns.join(", ")}
              </Callout.Text>
            </Callout.Root>
          )}
          <PatternTable
            rows={uc.patterns}
            onOpenFile={onOpenFile}
            emptyText="This use case names no patterns."
          />
        </Box>
      ))}

      <Text size="2" weight="medium" as="p" mb="1" mt="3">
        Claimed by {app.label}, named by no use case
      </Text>
      <PatternTable
        rows={app.unreachedPatterns}
        onOpenFile={onOpenFile}
        emptyText="Every pattern claiming this app is named by a use case."
      />
    </Box>
  );
}

export function PatternsDashboard({
  octokit,
  onOpenFile,
}: PatternsDashboardProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; index: PatternIndex }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const index = await loadPatternIndex(octokit);
        if (!cancelled) setState({ kind: "ready", index });
      } catch (err) {
        if (!cancelled)
          setState({ kind: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [octokit]);

  const summary = useMemo(() => {
    if (state.kind !== "ready") return null;
    const { patterns, apps } = state.index;
    const captures = patterns.reduce((n, p) => n + p.recipes.length, 0);
    const withCapture = patterns.filter((p) => p.recipes.length > 0).length;
    const useCases = apps.reduce((n, a) => n + a.useCases.length, 0);
    const namedByAUseCase = new Set(
      apps.flatMap((a) =>
        a.useCases.flatMap((u) => u.patterns.map((p) => p.slug)),
      ),
    ).size;
    return {
      patterns: patterns.length,
      apps: apps.length,
      useCases,
      captures,
      withCapture,
      namedByAUseCase,
      // The `when` clause is what tells a pattern from its siblings, and the
      // schema does not require it, so its absence is the gap most worth
      // counting on the front door rather than finding by scanning.
      noWhen: patterns.filter((p) => !p.when).length,
    };
  }, [state]);

  if (state.kind === "loading") {
    return (
      <Box p="6">
        <Flex align="center" gap="2">
          <Spinner />
          <Text size="2" color="gray">
            Loading patterns…
          </Text>
        </Flex>
      </Box>
    );
  }

  if (state.kind === "error") {
    return (
      <Box p="6">
        <Callout.Root color="red">
          <Callout.Text>Failed to load patterns: {state.message}</Callout.Text>
        </Callout.Root>
      </Box>
    );
  }

  const { index } = state;

  return (
    <Box p="5" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Heading as="h3" size="5" mb="1">
        Patterns
      </Heading>
      <Text size="2" color="gray" mb="4" as="p">
        {summary!.patterns} patterns across {summary!.apps} apps ·{" "}
        {summary!.useCases} use cases naming {summary!.namedByAUseCase} of them
        · {summary!.captures} captured page recipes on {summary!.withCapture}{" "}
        patterns · {summary!.noWhen} with no when clause, the sentence that
        tells a pattern from its siblings. A pattern claiming two apps is listed
        under both, so the per-app counts below overlap and do not sum to{" "}
        {summary!.patterns}.
      </Text>

      {index.recipesNamingMissingPatterns.length > 0 && (
        <Callout.Root color="red" mb="4">
          <Callout.Text>
            {index.recipesNamingMissingPatterns.length} captured recipe
            {index.recipesNamingMissingPatterns.length === 1 ? "" : "s"} name a
            pattern that does not exist:{" "}
            {index.recipesNamingMissingPatterns
              .map((e) => `${e.recipe.slug} names ${e.missing.join(", ")}`)
              .join("; ")}
          </Callout.Text>
        </Callout.Root>
      )}

      {index.recipesNamingNoPattern.length > 0 && (
        <Callout.Root color="amber" mb="4">
          <Callout.Text>
            {index.recipesNamingNoPattern.length} captured recipe
            {index.recipesNamingNoPattern.length === 1 ? "" : "s"} declare no
            pattern, so nothing links them to an app:{" "}
            {index.recipesNamingNoPattern.map((r) => r.slug).join(", ")}
          </Callout.Text>
        </Callout.Root>
      )}

      {index.patternsClaimingUnknownApps.length > 0 && (
        <Callout.Root color="red" mb="4">
          <Callout.Text>
            {index.patternsClaimingUnknownApps.length} pattern
            {index.patternsClaimingUnknownApps.length === 1 ? "" : "s"} claim an
            app the context does not define:{" "}
            {index.patternsClaimingUnknownApps
              .map((e) => `${e.pattern} → ${e.apps.join(", ")}`)
              .join("; ")}
          </Callout.Text>
        </Callout.Root>
      )}

      {index.apps.map((app, i) => (
        <Box key={app.slug}>
          {i > 0 && <Separator size="4" mb="5" />}
          <AppBlock app={app} onOpenFile={onOpenFile} />
        </Box>
      ))}
    </Box>
  );
}
