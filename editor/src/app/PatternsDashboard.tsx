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

/** A use case that names this pattern, and the product it belongs to. */
interface Reach {
  app: string;
  appLabel: string;
  /** Every job of that use case, not only the first. The grouped layout showed
   *  the first as the block title and the rest on an "Also:" line. */
  jobs: string[];
  /** Who the use case is for. The grouped layout put these in badges beside the
   *  block title; with the blocks gone they had no surface at all, so they ride
   *  on the row's hover text where the job they belong to is. */
  audience: string[];
}

interface CatalogueRow extends PatternRow {
  /** The use cases that reach this pattern, each tagged with its product.
   *
   *  Tagged, and not a flat list of job strings, because the column is read
   *  under a product filter: a pattern claiming Studio and Explorer but named
   *  only by Explorer would otherwise show an Explorer job under the Studio
   *  filter, which states the opposite of the truth. Claiming a product and
   *  being reached by one are different facts and the old layout kept them
   *  apart with a separate table per product. */
  reach: Reach[];
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
    /** The pattern whose row carried the chip, so a filter that hides that row
     *  also closes the panel describing it. */
    slug: string;
    token: number;
    // The chip that opened the panel, so closing returns focus there instead of
    // stranding a keyboard reader on <body>.
    trigger: HTMLElement | null;
  } | null>(null);
  const openRecipe = (
    recipe: PatternRecipe,
    slug: string,
    trigger: HTMLElement | null,
  ) =>
    setOpened((prev) => ({
      recipe,
      slug,
      trigger,
      token: (prev?.token ?? 0) + 1,
    }));
  const closeRecipe = () => {
    // `isConnected` because a filter change can unmount the chip while its
    // panel is open: focusing a detached node is a silent no-op that drops the
    // keyboard reader onto <body>, which is the exact regression the trigger
    // was recorded to prevent.
    if (opened?.trigger?.isConnected) opened.trigger.focus();
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

    // slug -> the use cases that reach it, each tagged with its product. Built
    // here rather than read off a field because the join lives on the APP: a
    // use case names pattern slugs, and the pattern does not know which jobs
    // reached it.
    const reachFor = new Map<string, Reach[]>();
    for (const app of apps) {
      for (const uc of app.useCases) {
        if (uc.jobs.length === 0) continue;
        for (const p of uc.patterns) {
          const list = reachFor.get(p.slug) ?? [];
          list.push({
            app: app.slug,
            appLabel: app.label,
            jobs: uc.jobs,
            audience: uc.audience,
          });
          reachFor.set(p.slug, list);
        }
      }
    }

    const rows: CatalogueRow[] = patterns
      .map((p) => ({ ...p, reach: reachFor.get(p.slug) ?? [] }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // `all` is not a product slug, and this checks it rather than trusting it:
    // an app slug of `all` would give two SegmentedControl items the same
    // value, which Radix keys selection by, so both would light up while the
    // filter silently showed everything. A wrong answer with no symptom.
    //
    // REPORTED, not thrown. A throw here runs during render, and this codebase
    // has already paid for that once: a helper that threw inside a useMemo took
    // the whole app down on a 403. There is a ScreenErrorBoundary now, so a
    // throw would be contained, but it would report the boundary's generic
    // wording for a specific and nameable substrate defect.
    const slugClash = apps.some((a) => a.slug === ALL);

    return {
      rows,
      productName,
      apps,
      slugClash,
    };
  }, [state]);

  /**
   * The rows each filter would leave, computed by applying every OTHER filter
   * first.
   *
   * Both counts used to be taken over the full list while the table applied
   * both predicates, so with a product selected the checkbox promised 17 rows
   * and the table drew the handful of them that were also in that product. A
   * control that advertises a number it will not produce is worse than no
   * control, which is the bar this page set for itself.
   */
  const shown = useMemo(() => {
    if (!catalogue) return [];
    return catalogue.rows.filter(
      (r) =>
        (product === ALL || r.apps.includes(product)) &&
        (!onlyMissingWhen || !hasWhen(r)),
    );
  }, [catalogue, product, onlyMissingWhen]);

  const counts = useMemo(() => {
    if (!catalogue) return null;
    // Each product chip counts what selecting it would show, so it honours the
    // when-clause checkbox if that is ticked.
    const underWhen = catalogue.rows.filter(
      (r) => !onlyMissingWhen || !hasWhen(r),
    );
    return {
      products: catalogue.apps.map((a) => ({
        slug: a.slug,
        label: a.label,
        count: underWhen.filter((r) => r.apps.includes(a.slug)).length,
      })),
      // ...and the checkbox counts what ticking it would show, so it honours
      // the product selection.
      missingWhen: catalogue.rows.filter(
        (r) =>
          (product === ALL || r.apps.includes(product)) && !hasWhen(r),
      ).length,
    };
  }, [catalogue, product, onlyMissingWhen]);

  // A panel outliving its row describes a capture for a pattern the reader can
  // no longer see, and its Close button then has nothing to return focus to.
  useEffect(() => {
    if (opened && !shown.some((r) => r.slug === opened.slug)) setOpened(null);
  }, [shown, opened]);

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

  if (c.slugClash) {
    return (
      <Box p="5" style={{ maxWidth: 1100, margin: "0 auto" }}>
        {heading}
        <Callout.Root color="red" role="alert" mt="3">
          <Callout.Text>
            A product is slugged &quot;{ALL}&quot;, which collides with the
            all-products filter on this screen. Rename it in
            <code> app-context/src/apps/</code> and the catalogue will load.
          </Callout.Text>
        </Callout.Root>
      </Box>
    );
  }

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
          {counts!.products.map((p) => (
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
            Missing a when clause ({counts!.missingWhen})
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
                          openRecipe(r, p.slug, e.currentTarget as HTMLElement),
                        )}
                        // Opens a READ-ONLY panel, and still hands no path to
                        // the router: a recipe is JSON, EditorShell routes only
                        // _meta.yml, the app-context frontmatter forms and
                        // plain markdown, so routing here would land on the
                        // refusal banner.
                        onClick={(e) => openRecipe(r, p.slug, e.currentTarget)}
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
                {(() => {
                  // Scoped to the selection. Under the Studio filter, a pattern
                  // claiming Studio and Explorer but named only by an Explorer
                  // use case must not show an Explorer job: the truthful answer
                  // is that no Studio use case reaches it, and that per-product
                  // gap is what the grouped layout's "claimed by X, named by no
                  // use case" table used to report.
                  const reach =
                    product === ALL
                      ? p.reach
                      : p.reach.filter((r) => r.app === product);
                  if (reach.length === 0) {
                    return (
                      <Text size="1" color="gray">
                        {product === ALL
                          ? "No use case names it"
                          : `No ${c.productName.get(product) ?? product} use case names it`}
                      </Text>
                    );
                  }
                  const jobs = reach.flatMap((r) => r.jobs);
                  const extra = jobs.length - 1;
                  return (
                    <Text
                      size="1"
                      title={reach
                        .map(
                          (r) =>
                            `${r.appLabel}${
                              r.audience.length > 0
                                ? ` (${r.audience.join(", ")})`
                                : ""
                            }: ${r.jobs.join("; ")}`,
                        )
                        .join(" | ")}
                    >
                      {truncate(jobs[0]!, 60)}
                      {/* Counts the JOBS this row does not show, which is what
                          the reader is being told is hidden. It counted use
                          cases before, so a use case with three jobs reported
                          nothing extra at all. */}
                      {extra > 0 && ` (+${extra} more)`}
                    </Text>
                  );
                })()}
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
