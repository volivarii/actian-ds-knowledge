// src/app/GraphHealthTab.tsx
// Substrate health, reached at `#/health`. Not scoped to anything: orphans,
// edge counts and the graph are questions about the whole substrate at once,
// which is why this is not one of the scope overviews and why the address
// says health rather than relationships. Table-first (accessible, exact-value
// primary): connectivity metric cards + coverage-by-kind + hub/orphan tables;
// every row opens its file. A depth-1 SVG explorer (GraphView) is the accent,
// re-rooted by the "Explore" row action or search. Asset nodes (icons/logos/
// illustrations) are excluded via the shared eligibility filter.
import React, { useMemo, useState } from "react";
import type { Octokit } from "@octokit/rest";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  qualityReport,
  metricsByDimension,
  topHubs,
  orphanRows,
} from "../substrate/graphHealth";
import {
  eligibleSubset,
  eligibleGraphIndex,
} from "../substrate/graphEligibility";
import { layoutNeighborhood } from "../substrate/neighborhoodLayout";
import { GraphView } from "./GraphView";
import { relationTypeLabel } from "../lib/relationTypes";
import { linkLabel } from "../lib/nomenclature";
import { navTargetForNodeId } from "../substrate/navTargetForNodeId";
import { SCREEN_TITLE } from "../lib/routes";
import { AppContextMeters } from "./AppContextMeters";

const CONNECTIVITY_LABEL: Record<string, string> = {
  orphan_nodes: "Orphan nodes",
  components_without_category: "Components without a category",
  categories_without_a11y: "Categories with no accessibility rule",
  criteria_unreferenced: "Criteria nothing must follow",
  // Without these two the tiles printed `composition_edges` and
  // `pattern_component_edges`: the report's own identifiers, on the one screen
  // a reader comes to for a plain answer. They are also SIZE rather than
  // trouble, and the four above are trouble, so the words say which.
  composition_edges: "Component composition links",
  pattern_component_edges: "Pattern to component links",
};
// Names each coverage metric by the RELATIONSHIP it measures, so this strip,
// the edge legend and the node legend on the same tab agree. `a11y_ref` used to
// read "Accessibility refs" here, "Must follow" in the legend, and its Thing
// word is "Criterion" — three names for one edge on one screen.
const COVERAGE_LABEL: Record<string, string> = {
  a11y_ref: `${linkLabel("a11y_ref", "out")} · accessibility`,
  foundations_ref: `${linkLabel("foundations_ref", "out")} · foundations`,
  motion_ref: `${linkLabel("motion_ref", "out")} · motion`,
  overall: "Overall",
};

// Delegates rather than re-deriving: the word for a node type is the
// nomenclature's to give, and a local copy here is how two screens end up
// naming the same type differently.
const typeLabel = relationTypeLabel;

export interface GraphHealthTabProps {
  /** Read-only, for the application-context block: everything else on this
   *  screen reads module-stable graph data and needs no client. */
  octokit: Octokit;
  onOpenFile: (path: string) => void;
}

/** The orphan table shows at most this many rows. A cap is fine; a cap that
 *  says nothing is not — 31 orphans would render 30 and report no shortfall,
 *  which is absence failing to state its cause. */
const ORPHAN_CAP = 30;

/** Pure (exported for tests): what the table says about what it withheld.
 *  `null` when nothing was withheld, so the screen stays silent rather than
 *  printing "showing all of them" on every render. */
export function orphanCapNote(total: number, cap: number): string | null {
  return total > cap ? `Showing the first ${cap} of ${total}.` : null;
}

export function GraphHealthTab({ octokit, onOpenFile }: GraphHealthTabProps) {
  const subset = useMemo(() => eligibleSubset(), []);
  const index = useMemo(() => eligibleGraphIndex(), []);
  const hubs = useMemo(() => topHubs(subset, index, 10), [subset, index]);
  const orphans = useMemo(() => orphanRows(subset, index), [subset, index]);
  // P4: memoize — inputs are module-stable so deps are intentionally []
  const connectivity = useMemo(
    () => metricsByDimension(qualityReport, "connectivity"),
    [],
  );
  const coverage = useMemo(
    () => metricsByDimension(qualityReport, "coverage"),
    [],
  );

  const defaultFocusId = hubs[0]?.id ?? null;
  const [focusId, setFocusId] = useState<string | null>(defaultFocusId);
  const [query, setQuery] = useState("");

  const layout = useMemo(
    () => (focusId ? layoutNeighborhood(focusId, index, { depth: 1 }) : null),
    [focusId, index],
  );

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return subset.nodes
      .filter((n) => n.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, subset]);

  const focusTitle = focusId ? (index.node(focusId)?.title ?? "") : "";
  const focusTarget = focusId ? navTargetForNodeId(focusId) : null;

  return (
    <Box p="5" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Heading as="h1" size="5" mb="1">
        {SCREEN_TITLE.health}
      </Heading>
      <Text size="2" color="gray" mb="4" as="p">
        Substrate relationship health and a focused graph explorer. Visual
        assets (icons, logos, illustrations) are excluded. Click a row to open
        the file; <em>Explore</em> re-centers the graph.
      </Text>

      {/* Connectivity metric cards — whole-substrate CI metrics from
          quality-report.json (they INCLUDE visual assets); the hub/orphan
          tables below are the eligible, asset-excluded view. The caption keeps
          the two populations from reading as a contradiction (e.g. the
          substrate-wide "Orphan nodes" count vs the eligible "Orphans" table). */}
      <Text size="1" color="gray" as="p" mb="2">
        Substrate-wide metrics, which include visual assets (icons, logos).
        The hub and orphan tables below show the eligible, asset-excluded view,
        which is why the orphan tile and the orphan table below it differ.
      </Text>
      <Grid columns={{ initial: "2", sm: "4" }} gap="3" mb="4">
        {connectivity.map((m) => (
          <Card key={m.metric}>
            <Text size="6" weight="bold" as="div">
              {m.value}
            </Text>
            <Text size="1" color="gray" as="div">
              {CONNECTIVITY_LABEL[m.metric] ?? m.metric}
            </Text>
          </Card>
        ))}
      </Grid>

      {/* Coverage-by-kind */}
      <Heading as="h2" size="3" mb="2">
        Coverage by kind
      </Heading>
      <Flex gap="3" wrap="wrap" mb="4">
        {coverage.map((m) => (
          <Badge key={m.metric} variant="soft" color="gray" size="2">
            <Text weight="medium">{COVERAGE_LABEL[m.metric] ?? m.metric}</Text>
            <Text>{` · ${Math.round(m.value * 100)}%`}</Text>
          </Badge>
        ))}
      </Flex>

      <AppContextMeters octokit={octokit} />

      <Grid columns={{ initial: "1", md: "2" }} gap="5">
        {/* LEFT: tables (the accessible primary) */}
        <Box>
          <Heading as="h2" size="3" mb="2">
            Strongest hubs
          </Heading>
          <Table.Root variant="surface" size="1" mb="4">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Node</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Links</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {hubs.map((h) => {
                const hubTarget = navTargetForNodeId(h.id);
                return (
                  <Table.Row key={h.id}>
                    <Table.RowHeaderCell>{h.title}</Table.RowHeaderCell>
                    <Table.Cell>
                      <Badge variant="soft" color="gray">
                        {typeLabel(h.type)}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>{h.degree}</Table.Cell>
                    <Table.Cell>
                      <Flex gap="2">
                        <Button
                          size="1"
                          variant="soft"
                          onClick={() => setFocusId(h.id)}
                        >
                          Explore
                        </Button>
                        {hubTarget ? (
                          <Button
                            size="1"
                            variant="outline"
                            aria-label={`Open in editor: ${h.title}`}
                            onClick={() => onOpenFile(hubTarget)}
                          >
                            Open in editor
                          </Button>
                        ) : null}
                      </Flex>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>

          <Heading as="h2" size="3" mb="1">
            Orphans ({orphans.length})
          </Heading>
          <Text size="1" color="gray" as="p" mb="2">
            Eligible entities with no connections — visual assets excluded.
          </Text>
          {orphans.length === 0 ? (
            <Text size="2" color="gray">
              No orphaned entities.
            </Text>
          ) : (
            <Table.Root variant="surface" size="1">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Node</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {orphans.slice(0, ORPHAN_CAP).map((o) => {
                  const orphanTarget = navTargetForNodeId(o.id);
                  return (
                    <Table.Row key={o.id}>
                      <Table.RowHeaderCell>{o.title}</Table.RowHeaderCell>
                      <Table.Cell>
                        <Badge variant="soft" color="gray">
                          {typeLabel(o.type)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {orphanTarget ? (
                          <Button
                            size="1"
                            variant="outline"
                            aria-label={`Open in editor: ${o.title}`}
                            onClick={() => onOpenFile(orphanTarget)}
                          >
                            Open in editor
                          </Button>
                        ) : (
                          // An empty cell reads as "nothing to do here". These
                          // rows have plenty to do. Say that, rather than
                          // inventing a destination that would refuse (#697).
                          //
                          // Every orphan the screen renders today is a `term:`
                          // (16 of the 29) and the wording is exact for it:
                          // terms live in the single
                          // app-context/src/terminology.yml, which matches no
                          // frontmatterForms entry and is not plain markdown,
                          // so it routes to the RefusalBanner.
                          //
                          // It is NOT exact for every null `navTargetForNodeId`
                          // returns. `content:` resolves to null because the
                          // group dir (patterns|product|writing) cannot be
                          // recovered from the node id, not because the file
                          // has no surface — those files are editable. No
                          // content orphan reaches this table today, so the
                          // wording is not wrong on screen; it would be the
                          // moment one did, and the fix then is a reason per
                          // kind, not a different sentence here.
                          <Text size="1" color="gray">
                            No editor surface
                          </Text>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          )}
          {orphanCapNote(orphans.length, ORPHAN_CAP) && (
            <Text size="1" color="gray" as="p" mt="1">
              {orphanCapNote(orphans.length, ORPHAN_CAP)}
            </Text>
          )}
        </Box>

        {/* RIGHT: the explorer accent */}
        <Box>
          <Heading as="h2" size="3" mb="2">
            Explore
          </Heading>
          <TextField.Root
            placeholder="Search a node to center…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            mb="2"
          />
          {searchHits.length > 0 && (
            <Flex direction="column" gap="1" mb="2" align="start">
              {searchHits.map((n) => (
                <Button
                  key={n.id}
                  size="1"
                  variant="ghost"
                  onClick={() => {
                    setFocusId(n.id);
                    setQuery("");
                  }}
                >
                  {n.title}
                </Button>
              ))}
            </Flex>
          )}

          {focusId && layout ? (
            <Box>
              <Flex align="center" justify="between" mb="2">
                <Text size="2" weight="medium">
                  {focusTitle}
                </Text>
                {focusTarget ? (
                  <Button
                    size="1"
                    variant="outline"
                    aria-label={`Open in editor: ${focusTitle}`}
                    onClick={() => onOpenFile(focusTarget)}
                  >
                    Open in editor
                  </Button>
                ) : null}
              </Flex>
              <GraphView
                layout={layout}
                onFocusNode={setFocusId}
                onReset={() => setFocusId(defaultFocusId)}
              />
            </Box>
          ) : (
            <Text size="2" color="gray">
              Select a hub or search a node to explore its neighborhood.
            </Text>
          )}
        </Box>
      </Grid>
    </Box>
  );
}
