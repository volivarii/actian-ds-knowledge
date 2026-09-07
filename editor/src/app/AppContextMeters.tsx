// The completeness of the application context, and the joins in it that do not
// resolve. Rendered on `#/health`.
//
// This block opened `#/patterns` until the patterns page was cut back to a
// catalogue. Four Meter groups measuring Patterns, Entities, Products and
// Terms, plus three integrity callouts, meant a page named for one subject led
// with metrics for four, and put 24 numbers between its heading and its first
// pattern name. Substrate health is the screen named for this job.
//
// Self-contained and async: everything else on the health screen reads
// module-stable graph data, so this fetches on its own and shows a spinner in
// place rather than holding up the page.

import { useEffect, useMemo, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Box, Callout, Flex, Heading, Spinner, Text } from "@radix-ui/themes";
import { loadPatternIndex, type PatternIndex } from "../lib/patternIndex";
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

export interface AppContextMetersProps {
  octokit: Octokit;
}

export function AppContextMeters({ octokit }: AppContextMetersProps) {
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

  const heading = (
    <Heading as="h2" size="3" mb="2">
      Application context
    </Heading>
  );

  if (state.kind === "loading") {
    return (
      <Box mb="5">
        {heading}
        <Flex align="center" gap="2">
          <Spinner />
          <Text size="2" color="gray">
            Loading application context…
          </Text>
        </Flex>
      </Box>
    );
  }

  if (state.kind === "error") {
    return (
      <Box mb="5">
        {heading}
        {/* Not `role="alert"`: this is one section failing on a page whose
            other sections rendered, so it is content to read where the block
            would have been, not an interruption. */}
        <Callout.Root color="red" aria-live="off">
          <Callout.Text>
            Could not read the application context: {state.message}
          </Callout.Text>
        </Callout.Root>
      </Box>
    );
  }

  const { index } = state;

  // Per USE CASE, not per index: a use case naming a pattern that does not
  // exist is a broken join like the three below, but the join lives on the app,
  // so it has to be gathered rather than read off a field. The old patterns
  // page rendered this inside each use case block; when the blocks went, this
  // was the one signal with nowhere left to land.
  const useCasesNamingMissing = index.apps.flatMap((app) =>
    app.useCases
      .filter((uc) => uc.missingPatterns.length > 0)
      .map((uc) => ({
        app: app.label,
        job: uc.jobs[0] ?? "a use case",
        missing: uc.missingPatterns,
      })),
  );

  return (
    <Box mb="5">
      {heading}
      {/* One date for the row: all four groups come from a single measurement,
          so stamping each of them says it four times and reads as four
          measurements that happen to agree. */}
      <Text size="1" color="gray" as="p" mb="2">
        measured {meters!.pattern[0]?.measuredAt}
      </Text>
      {!index.recipesReadable && (
        // Say why the Meter is absent. Dropping it in silence is the same
        // omission as reporting a zero nobody can explain.
        <Text size="1" color="gray" as="p" mb="2">
          {SLOT_LABEL.capture} not measured: the captures could not be read
          completely. Either the directory would not list, or a file in it would
          not read.
        </Text>
      )}
      <Flex gap="6" wrap="wrap" mb="4">
        <MeterList
          groupKey="pattern"
          title={THING_LABEL.ux_pattern}
          meters={meters!.pattern}
          showDate={false}
        />
        <MeterList
          groupKey="entity"
          title={THING_LABEL.app_entity}
          meters={meters!.entity}
          showDate={false}
        />
        <MeterList
          groupKey="product"
          title={THING_LABEL.app}
          meters={meters!.product}
          showDate={false}
        />
        <MeterList
          groupKey="term"
          title={THING_LABEL.terminology_term}
          meters={meters!.term}
          showDate={false}
        />
      </Flex>

      {/* Standing data-integrity diagnostics, rendered from the index on every
          mount: content to read, not events to announce. `aria-live` off says
          so explicitly, which is how a deliberate choice stays distinguishable
          from a forgotten role. */}
      {useCasesNamingMissing.length > 0 && (
        <Callout.Root color="red" aria-live="off" mb="3">
          <Callout.Text>
            {useCasesNamingMissing.length} use case
            {useCasesNamingMissing.length === 1 ? "" : "s"} name a pattern that
            does not exist:{" "}
            {useCasesNamingMissing
              .map((e) => `${e.app}, "${e.job}" names ${e.missing.join(", ")}`)
              .join("; ")}
          </Callout.Text>
        </Callout.Root>
      )}

      {index.recipesNamingMissingPatterns.length > 0 && (
        <Callout.Root color="red" aria-live="off" mb="3">
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
        <Callout.Root color="amber" aria-live="off" mb="3">
          <Callout.Text>
            {index.recipesNamingNoPattern.length} captured recipe
            {index.recipesNamingNoPattern.length === 1 ? "" : "s"} declare no
            pattern, so nothing links them to a product:{" "}
            {index.recipesNamingNoPattern.map((r) => r.slug).join(", ")}
          </Callout.Text>
        </Callout.Root>
      )}

      {index.patternsClaimingUnknownApps.length > 0 && (
        <Callout.Root color="red" aria-live="off" mb="3">
          <Callout.Text>
            {index.patternsClaimingUnknownApps.length} pattern
            {index.patternsClaimingUnknownApps.length === 1 ? "" : "s"} claim a
            product the context does not define:{" "}
            {index.patternsClaimingUnknownApps
              .map((e) => `${e.pattern} to ${e.apps.join(", ")}`)
              .join("; ")}
          </Callout.Text>
        </Callout.Root>
      )}
    </Box>
  );
}
