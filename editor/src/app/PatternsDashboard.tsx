// Patterns tab on the editor's front door.
//
// App-first, because that is how the substrate is shaped: an app defines use
// cases (an audience, its jobs, and the patterns that serve them), a pattern
// claims one or more apps, and a captured page recipe names its pattern, its
// app and the surface it was taken from. A flat list with an app filter would
// show only the weakest of those three.
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
  Flex,
  Heading,
  Separator,
  Spinner,
  Table,
  Text,
  VisuallyHidden,
} from "@radix-ui/themes";
import {
  loadPatternIndex,
  type AppSection,
  type PatternIndex,
  type PatternRecipe,
  type PatternRow,
  recipeSrcPath,
} from "../lib/patternIndex";
import { onActivateKey } from "../lib/onActivateKey";
import { THING_LABEL, SLOT_LABEL } from "../lib/nomenclature";
import { measure, measuredToday } from "../lib/measure";
import {
  patternSlotsFor,
  ENTITY_SLOTS,
  PRODUCT_SLOTS,
  TERM_SLOTS,
  patternSlotRecords,
  entitySlotRecords,
  productSlotRecords,
  termSlotRecords,
} from "../lib/slots";
import { MeterList } from "./MeterList";
import { RecipePanel } from "./RecipePanel";

export interface PatternsDashboardProps {
  octokit: Octokit;
  onOpenFile: (path: string) => void;
}

const PATTERN_SRC = (slug: string) => `app-context/src/patterns/${slug}.md`;

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function PatternTable({
  rows,
  onOpenFile,
  onOpenRecipe,
  emptyText,
  recipesReadable,
}: {
  rows: PatternRow[];
  onOpenFile: (path: string) => void;
  onOpenRecipe: (recipe: PatternRecipe, trigger: HTMLElement | null) => void;
  emptyText: string;
  /** False when the captures could not be read, so an empty cell means
   *  "not looked at", not "none". */
  recipesReadable: boolean;
}) {
  return (
    <Table.Root variant="surface" size="1">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Pattern</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Products</Table.ColumnHeaderCell>
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
              {/* An em-dash reads as an authored fact — "this pattern has no
                  capture" — for all 31 rows when the truth is that nothing
                  could be read. The Meter and the prose already withhold on a
                  failed read; the column has to as well, or the screen states
                  in a table what it just declined to state above it. */}
              {!recipesReadable && p.recipes.length === 0 ? (
                // A bare "?" is cryptic on its own, and this cell is the only
                // place a reader meets the distinction. The title and the
                // visually hidden text carry the reason, so it does not depend
                // on having read the note above the table. Hidden TEXT and not
                // `aria-label`: a Radix Text is a span with no role, and ARIA
                // 1.2 prohibits naming a generic element, so assistive
                // technology dropped the label and announced "?".
                <Text
                  size="1"
                  color="gray"
                  title="Not measured: the captures could not be read"
                >
                  <span aria-hidden="true">?</span>
                  <VisuallyHidden>
                    Captures not measured: they could not be read
                  </VisuallyHidden>
                </Text>
              ) : p.recipes.length === 0 ? (
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
                      style={{ cursor: "pointer" }}
                      // A Badge renders a span. Without these a keyboard user
                      // never reaches the chip and the panel is mouse-only.
                      role="button"
                      tabIndex={0}
                      onKeyDown={onActivateKey((e) =>
                        onOpenRecipe(r, e.currentTarget as HTMLElement),
                      )}
                      // Opens a READ-ONLY panel, and still hands no path to the
                      // router: a recipe is JSON, EditorShell routes only
                      // _meta.yml, the app-context frontmatter forms and plain
                      // markdown, so routing here would land on the refusal
                      // banner. Editing a recipe is the Class C JSON widget,
                      // still unbuilt.
                      onClick={(e) => onOpenRecipe(r, e.currentTarget)}
                      title={`${r.surface ?? r.slug}${
                        r.capturedOn ? `, captured ${r.capturedOn}` : ""
                      }. ${recipeSrcPath(r.slug)}`}
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
  onOpenRecipe,
  recipesReadable,
}: {
  app: AppSection;
  onOpenFile: (path: string) => void;
  onOpenRecipe: (recipe: PatternRecipe, trigger: HTMLElement | null) => void;
  recipesReadable: boolean;
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
            onOpenRecipe={onOpenRecipe}
            emptyText="This use case names no patterns."
            recipesReadable={recipesReadable}
          />
        </Box>
      ))}

      <Text size="2" weight="medium" as="p" mb="1" mt="3">
        Claimed by {app.label}, named by no use case
      </Text>
      <PatternTable
        rows={app.unreachedPatterns}
        onOpenFile={onOpenFile}
        onOpenRecipe={onOpenRecipe}
        emptyText="Every pattern claiming this product is named by a use case."
        recipesReadable={recipesReadable}
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
  // The capture a reader has opened, held here rather than per table so the two
  // tables in an app block (named, and claimed-but-unnamed) share one panel.
  //
  // The token counts OPENINGS, not recipes. buildPatternIndex maps the recipes
  // once, so a recipe claimed by two rows is the SAME object in both, and
  // setState with it again is a React bail-out: no re-render, no scroll, and a
  // reader who scrolled away sees nothing move. Keying the panel on the token
  // also returns the outline to collapsed, which is DOM state on <details> that
  // would otherwise survive a switch between captures.
  const [opened, setOpened] = useState<{
    recipe: PatternRecipe;
    token: number;
    // The chip that opened the panel, so closing returns focus there instead of
    // stranding a keyboard reader on <body> to tab from the top of the page.
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

  const meters = useMemo(() => {
    if (state.kind !== "ready") return null;
    const index = state.index;
    const at = measuredToday();
    return {
      pattern: measure(
        patternSlotRecords(index),
        patternSlotsFor(index.recipesReadable),
        at,
      ),
      entity: measure(entitySlotRecords(index.doc), ENTITY_SLOTS, at),
      product: measure(productSlotRecords(index.doc), PRODUCT_SLOTS, at),
      term: measure(termSlotRecords(index.doc), TERM_SLOTS, at),
    };
  }, [state]);

  const summary = useMemo(() => {
    if (state.kind !== "ready" || !meters) return null;
    const { patterns, apps } = state.index;
    // DISTINCT recipes, because the prose says "captured page recipes". The
    // old sum counted pattern-recipe PAIRS, and read correctly only while every
    // recipe named exactly one pattern: one recipe naming two would have said
    // "5 captured page recipes" with four files on disk. The last hand-count in
    // this object, and the one that was wrong.
    const captures = new Set(
      patterns.flatMap((p) => p.recipes.map((r) => r.slug)),
    ).size;
    const useCases = apps.reduce((n, a) => n + a.useCases.length, 0);
    // These three used to be counted here as well as in the Slot tables. Two
    // derivations of one number is what the Slot model exists to remove, so the
    // prose now reads the Meters and `tests/app/meters.test.tsx` asserts they cannot
    // drift apart.
    const meterFor = (key: string) => {
      const m = meters.pattern.find((x) => x.key === key);
      if (!m) throw new Error(`no Pattern meter ${key}`);
      return m;
    };
    // Capture is the one Slot that can be ABSENT: `patternSlotsFor` drops it
    // when the captures could not be read. Looking it up with `meterFor` threw
    // inside useMemo — during render, with no ErrorBoundary anywhere in the
    // editor — so a 403 on the recipes directory blanked the entire app rather
    // than hiding one Meter. The degraded path this branch added the note for
    // was the path that crashed.
    const captureMeter = meters.pattern.find((x) => x.key === "capture");
    const rule = meterFor("rule");
    return {
      patterns: patterns.length,
      apps: apps.length,
      useCases,
      // null, not 0: an unread directory has no count, and rendering "0
      // captured page recipes" for it is the lie the Slot is dropped to avoid.
      captures: captureMeter ? captures : null,
      withCapture: captureMeter?.filled ?? null,
      namedByAUseCase: meterFor("job").filled,
      // The `when` clause is what tells a pattern from its siblings, and the
      // schema does not require it, so its absence is the gap most worth
      // counting on the front door rather than finding by scanning.
      noWhen: rule.total - rule.filled,
    };
  }, [state, meters]);

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
      {meters && (
        <Box mb="5" mt="3">
          {/* One date for the row: all four groups come from a single
              measurement, so stamping each of them says it four times and
              reads as four measurements that happen to agree. */}
          <Text size="1" color="gray" as="p" mb="2">
            measured {meters.pattern[0]?.measuredAt}
          </Text>
          {!index.recipesReadable && (
            // Say why the Meter is absent. Dropping it in silence is the same
            // omission as reporting a zero nobody can explain.
            <Text size="1" color="gray" as="p" mb="2">
              {SLOT_LABEL.capture} not measured: the captures could not be
              read completely. Either the directory would not list, or a file
              in it would not read.
            </Text>
          )}
          <Flex gap="6" wrap="wrap">
            <MeterList
              groupKey="pattern"
              title={THING_LABEL.ux_pattern}
              meters={meters.pattern}
              showDate={false}
            />
            <MeterList
              groupKey="entity"
              title={THING_LABEL.app_entity}
              meters={meters.entity}
              showDate={false}
            />
            <MeterList
              groupKey="product"
              title={THING_LABEL.app}
              meters={meters.product}
              showDate={false}
            />
            <MeterList
              groupKey="term"
              title={THING_LABEL.terminology_term}
              meters={meters.term}
              showDate={false}
            />
          </Flex>
        </Box>
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
      <Text size="2" color="gray" mb="4" as="p">
        {summary!.patterns} patterns across {summary!.apps} products ·{" "}
        {summary!.useCases} use cases naming {summary!.namedByAUseCase} of them
        {summary!.captures !== null && (
          <>
            {" · "}
            {summary!.captures} captured page recipes on {summary!.withCapture}{" "}
            patterns
          </>
        )}{" "}
        · {summary!.noWhen} with no when clause, the sentence that
        tells a pattern from its siblings. A pattern claiming two products is
        listed under both, so the per-product counts below overlap and do not
        sum to{" "}
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
            pattern, so nothing links them to a product:{" "}
            {index.recipesNamingNoPattern.map((r) => r.slug).join(", ")}
          </Callout.Text>
        </Callout.Root>
      )}

      {index.patternsClaimingUnknownApps.length > 0 && (
        <Callout.Root color="red" mb="4">
          <Callout.Text>
            {index.patternsClaimingUnknownApps.length} pattern
            {index.patternsClaimingUnknownApps.length === 1 ? "" : "s"} claim a
            product the context does not define:{" "}
            {index.patternsClaimingUnknownApps
              .map((e) => `${e.pattern} → ${e.apps.join(", ")}`)
              .join("; ")}
          </Callout.Text>
        </Callout.Root>
      )}

      {index.apps.map((app, i) => (
        <Box key={app.slug}>
          {i > 0 && <Separator size="4" mb="5" />}
          <AppBlock
            app={app}
            onOpenFile={onOpenFile}
            onOpenRecipe={openRecipe}
            recipesReadable={index.recipesReadable}
          />
        </Box>
      ))}
    </Box>
  );
}
