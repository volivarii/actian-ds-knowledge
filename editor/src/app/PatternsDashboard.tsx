// The pattern catalogue, reached at `#/patterns`. One list, one row per
// pattern.
//
// This page used to be app-first: a block per product, inside it a table per
// use case, plus a table for the patterns that claimed the product but that no
// use case named. That shape rendered 31 patterns as 47 rows across 7 tables
// under one repeated five-column header, because a pattern claiming two
// products was drawn under both. Product is a FILTER here instead, which keeps
// that fact reachable without duplicating a row in order to state it.
//
// The four Meter groups and the three integrity callouts that used to open this
// page now live on `#/health`. They measured Patterns, Entities, Products and
// Terms, so a page called Patterns opened with metrics for three subjects that
// are not patterns, and a reader met 24 numbers before the first pattern name.
// Substrate health is the screen named for that job and already shaped for it.
//
// Pure read. A pattern row opens its source markdown; a capture chip opens a
// read-only RecipePanel, which routes nowhere because a recipe is JSON and
// EditorShell has no JSON surface. Nothing here writes, and patterns carry no
// status field, so there is no promote control to mirror the guidance domains.

import { useEffect, useMemo, useState } from "react";
import type { Octokit } from "@octokit/rest";
import {
  Badge,
  Box,
  Callout,
  Checkbox,
  Flex,
  Heading,
  SegmentedControl,
  Spinner,
  Table,
  Text,
} from "@radix-ui/themes";
import {
  loadPatternIndex,
  type PatternIndex,
  type PatternRecipe,
  type PatternRow,
  recipeSrcPath,
} from "../lib/patternIndex";
import { onActivateKey } from "../lib/onActivateKey";
import { hasWhenClause } from "../lib/slots";
import { RecipePanel } from "./RecipePanel";
import { SCREEN_TITLE } from "../lib/routes";

export interface PatternsDashboardProps {
  octokit: Octokit;
  onOpenFile: (path: string) => void;
}

const PATTERN_SRC = (slug: string) => `app-context/src/patterns/${slug}.md`;

/** Every product, in the filter. Not a slug: `all` is not a product slug and
 *  the substrate will never mint one. */
const ALL = "all";

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

/**
 * One definition of "this pattern has a when clause", read by the marker in the
 * cell, the filter and the count in the filter's own label.
 *
 * Delegates to the Slot's own predicate rather than restating it. The `rule`
 * Meter on `#/health` measures exactly this, so a local `when.trim()` here
 * would be a SECOND derivation of one fact across two screens: the trap the
 * Slot model exists to close.
 */
function hasWhen(p: PatternRow): boolean {
  return hasWhenClause(p.when);
}

interface CatalogueRow extends PatternRow {
  /** The jobs that some product's use case says this pattern serves. Claiming
   *  a product is a different fact from being reached by one, which is why this
   *  is its own column rather than folded into the product badges. */
  jobs: string[];
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

  const [product, setProduct] = useState<string>(ALL);
  const [onlyMissingWhen, setOnlyMissingWhen] = useState(false);

  // The capture a reader has opened. The token counts OPENINGS, not recipes:
  // buildPatternIndex maps the recipes once, so a recipe claimed by two rows is
  // the SAME object in both, and setState with it again is a React bail-out
  // (no re-render, no scroll, nothing moves for a reader who scrolled away).
  // Keying the panel on the token also returns the outline to collapsed, which
  // is DOM state on <details> that would otherwise survive a switch.
  const [opened, setOpened] = useState<{
    recipe: PatternRecipe;
    token: number;
    // The chip that opened the panel, so closing returns focus there instead of
    // stranding a keyboard reader on <body>.
    trigger: HTMLElement | null;
  } | null>(null);
  const openRecipe = (recipe: PatternRecipe, trigger: HTMLElement | null) =>
    setOpened((prev) => ({ recipe, trigger, token: (prev?.token ?? 0) + 1 }));
  const closeRecipe = () => {
    opened?.trigger?.focus();
    setOpened(null);
  };

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

  const catalogue = useMemo(() => {
    if (state.kind !== "ready") return null;
    const { apps, patterns } = state.index;

    // Product LABELS, not slugs. The old table printed `administration` in a
    // badge under a heading that said Administration, which is the repository's
    // word for a product this app already has a name for.
    const productName = new Map(apps.map((a) => [a.slug, a.label]));

    // slug -> the jobs some use case says it serves. Built here rather than
    // read off a field because the join lives on the APP: a use case names
    // pattern slugs, and the pattern does not know which jobs reached it.
    const jobsFor = new Map<string, string[]>();
    for (const app of apps) {
      for (const uc of app.useCases) {
        const job = uc.jobs[0];
        if (!job) continue;
        for (const p of uc.patterns) {
          const list = jobsFor.get(p.slug) ?? [];
          if (!list.includes(job)) list.push(job);
          jobsFor.set(p.slug, list);
        }
      }
    }

    const rows: CatalogueRow[] = patterns
      .map((p) => ({ ...p, jobs: jobsFor.get(p.slug) ?? [] }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      rows,
      productName,
      // A pattern claiming two products is counted by both, so these do not sum
      // to `rows.length`. That is a property of the substrate, and a filter
      // shows it without the paragraph the grouped layout needed to explain it.
      products: apps.map((a) => ({
        slug: a.slug,
        label: a.label,
        count: rows.filter((r) => r.apps.includes(a.slug)).length,
      })),
      missingWhen: rows.filter((r) => !hasWhen(r)).length,
    };
  }, [state]);

  const shown = useMemo(() => {
    if (!catalogue) return [];
    return catalogue.rows.filter(
      (r) =>
        (product === ALL || r.apps.includes(product)) &&
        (!onlyMissingWhen || !hasWhen(r)),
    );
  }, [catalogue, product, onlyMissingWhen]);

  // The page's name renders in every state: a reader arriving during the fetch
  // used to find a page with no h1 at all.
  const heading = (
    <Heading as="h1" size="5" mb="1">
      {SCREEN_TITLE.patterns}
    </Heading>
  );

  if (state.kind === "loading") {
    return (
      <Box p="5" style={{ maxWidth: 1100, margin: "0 auto" }}>
        {heading}
        <Flex align="center" gap="2" mt="3">
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
      <Box p="5" style={{ maxWidth: 1100, margin: "0 auto" }}>
        {heading}
        <Callout.Root color="red" role="alert" mt="3">
          <Callout.Text>Failed to load patterns: {state.message}</Callout.Text>
        </Callout.Root>
      </Box>
    );
  }

  const { index } = state;
  const c = catalogue!;

  return (
    <Box p="5" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {heading}
      <Text size="2" color="gray" as="p" mb="4">
        Reusable page shapes, each with the components it is built from and the
        sentence that says when to reach for it. A pattern can belong to more
        than one product, so the product filters overlap.
      </Text>

      <Flex gap="5" align="center" wrap="wrap" mb="2">
        <SegmentedControl.Root
          size="1"
          value={product}
          onValueChange={setProduct}
          aria-label="Filter by product"
        >
          <SegmentedControl.Item value={ALL}>
            All products
          </SegmentedControl.Item>
          {c.products.map((p) => (
            <SegmentedControl.Item key={p.slug} value={p.slug}>
              {p.label} ({p.count})
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>

        <Text as="label" size="2">
          <Flex gap="2" align="center">
            <Checkbox
              checked={onlyMissingWhen}
              onCheckedChange={(v) => setOnlyMissingWhen(v === true)}
            />
            Missing a when clause ({c.missingWhen})
          </Flex>
        </Text>
      </Flex>

      {/* Announced, because changing a filter changes this number and nothing
          else on the page says how many rows the change left. */}
      <Text size="1" color="gray" as="p" mb="3" role="status">
        Showing {shown.length} of {c.rows.length} patterns
      </Text>

      {!index.recipesReadable && (
        // Said once, above the table, rather than in a cell on every row. A
        // failed read is one fact about the page, not 31 facts about patterns.
        <Text size="1" color="gray" as="p" mb="3">
          Captures could not be read completely, so a pattern with no capture
          chip below may still have one. Either the directory would not list, or
          a file in it would not read.
        </Text>
      )}

      {opened && (
        <Box mb="4">
          <RecipePanel
            key={opened.token}
            recipe={opened.recipe}
            onClose={closeRecipe}
          />
        </Box>
      )}

      <Table.Root variant="surface" size="1">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Pattern</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>When to use it</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Products</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Job it serves</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Components</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {shown.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={5}>
                <Text color="gray">No pattern matches these filters.</Text>
              </Table.Cell>
            </Table.Row>
          )}
          {shown.map((p) => (
            <Table.Row key={p.slug}>
              <Table.RowHeaderCell>
                {/* role/tabIndex/onKeyDown are not decoration: a Radix Text is
                    a span, so the click handler alone made every pattern name
                    on this page reachable by mouse only. The capture chip below
                    already carried the fix; the name never got it. */}
                <Text
                  weight="medium"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => onOpenFile(PATTERN_SRC(p.slug))}
                  onKeyDown={onActivateKey(() =>
                    onOpenFile(PATTERN_SRC(p.slug)),
                  )}
                >
                  {p.label}
                </Text>
                <Text size="1" color="gray" as="p">
                  {p.slug}
                </Text>
                {/* Captures live in the name cell rather than a column of their
                    own. Three of 31 patterns have one, so the column was 87%
                    dashes: a fact worth keeping, not a fact worth a column. */}
                {p.recipes.length > 0 && (
                  <Flex gap="1" wrap="wrap" mt="1">
                    {p.recipes.map((r) => (
                      <Badge
                        key={r.slug}
                        variant="soft"
                        color="green"
                        size="1"
                        style={{ cursor: "pointer" }}
                        // A Badge renders a span. Without these a keyboard user
                        // never reaches the chip and the panel is mouse-only.
                        role="button"
                        tabIndex={0}
                        onKeyDown={onActivateKey((e) =>
                          openRecipe(r, e.currentTarget as HTMLElement),
                        )}
                        // Opens a READ-ONLY panel, and still hands no path to
                        // the router: a recipe is JSON, EditorShell routes only
                        // _meta.yml, the app-context frontmatter forms and
                        // plain markdown, so routing here would land on the
                        // refusal banner.
                        onClick={(e) => openRecipe(r, e.currentTarget)}
                        title={`${r.surface ?? r.slug}${
                          r.capturedOn ? `, captured ${r.capturedOn}` : ""
                        }. ${recipeSrcPath(r.slug)}`}
                      >
                        {truncate(r.surface ?? r.slug, 42)}
                      </Badge>
                    ))}
                  </Flex>
                )}
              </Table.RowHeaderCell>
              <Table.Cell>
                <Text size="1" title={p.when ?? undefined}>
                  {hasWhen(p) ? (
                    truncate(p.when, 150)
                  ) : (
                    <Text color="amber">Not written yet</Text>
                  )}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Flex gap="1" wrap="wrap">
                  {p.apps.map((a) => (
                    <Badge key={a} variant="soft" color="gray" size="1">
                      {c.productName.get(a) ?? a}
                    </Badge>
                  ))}
                </Flex>
              </Table.Cell>
              <Table.Cell>
                {p.jobs.length > 0 ? (
                  <Text size="1" title={p.jobs.join("; ")}>
                    {truncate(p.jobs[0]!, 60)}
                    {p.jobs.length > 1 && ` (+${p.jobs.length - 1})`}
                  </Text>
                ) : (
                  <Text size="1" color="gray">
                    No use case names it
                  </Text>
                )}
              </Table.Cell>
              <Table.Cell>
                <Text size="1" title={p.components.join(", ")}>
                  {p.components.length}
                </Text>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
