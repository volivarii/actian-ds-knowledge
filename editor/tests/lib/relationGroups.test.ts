// Turns the flat, edge-type-badged graph neighbours into human-labelled groups
// so the relations rail speaks author vocabulary, never the internal edge keys
// (composed_of, uses_component, in_category, a11y_ref).
//
// The vocabulary is four reciprocal pairs — eight words in total — so one
// relationship reads correctly from either end. It replaced 24 one-off phrases
// that gave each side of each edge its own wording, which is how the same
// relationship read as "Built from these components" on one screen and
// "Used in patterns" on another.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  relationGroupLabel,
  groupGraphNeighbors,
} from "../../src/lib/relationGroups";
import { LINK_LABEL } from "../../src/lib/nomenclature";
import { rankedLabels } from "../../src/lib/relationGroups";
import type { Neighbor } from "../../src/substrate/graphIndex";

function neighbor(
  id: string,
  type: string,
  edgeType: string,
  direction: "in" | "out",
): Neighbor {
  return {
    id,
    node: { id, type, title: id.split(":")[1] ?? id },
    edgeType,
    note: null,
    direction,
  };
}

test("relationGroupLabel returns one of eight words, reciprocal by direction", () => {
  // composition: what a record is MADE OF. A Pattern is Built from Tabs;
  // Tabs is Used in that Pattern.
  assert.equal(relationGroupLabel("composed_of", "out"), "Built from");
  assert.equal(relationGroupLabel("composed_of", "in"), "Used in");
  assert.equal(relationGroupLabel("uses_component", "out"), "Built from");
  assert.equal(relationGroupLabel("uses_component", "in"), "Used in");

  // in_app is membership, NOT composition. The edge points Pattern -> Product,
  // so from the Pattern's side "out" means "belongs to Studio". Reading it as
  // composition would say a Pattern is "built from" Studio, and would merge
  // belonging with dependency into one list.
  assert.equal(relationGroupLabel("in_app", "out"), "Part of");
  assert.equal(relationGroupLabel("in_app", "in"), "Contains");

  assert.equal(relationGroupLabel("in_category", "out"), "Part of");
  assert.equal(relationGroupLabel("in_category", "in"), "Contains");
  // narrower runs parent -> child, the OPPOSITE way from in_category and
  // in_app, so its outbound neighbours are what this record CONTAINS. The
  // first implementation had this inverted and a test locked it in; the
  // orientation is now asserted against the graph's own ids in
  // tests/lib/nomenclature.test.ts.
  assert.equal(relationGroupLabel("narrower", "out"), "Contains");
  assert.equal(relationGroupLabel("narrower", "in"), "Part of");

  assert.equal(relationGroupLabel("a11y_ref", "out"), "Must follow");
  assert.equal(relationGroupLabel("a11y_ref", "in"), "Required by");
  assert.equal(relationGroupLabel("foundations_ref", "out"), "Must follow");
  assert.equal(relationGroupLabel("motion_ref", "in"), "Required by");

  assert.equal(relationGroupLabel("related", "out"), "Related to");
  assert.equal(relationGroupLabel("entity_related", "in"), "Related to");
  assert.equal(relationGroupLabel("term_about", "out"), "Related to");
});

test("an unmapped edge type reads as an association, never as snake_case", () => {
  // The old fallback humanised the key, so `composition_edges` became
  // "Composition edges" and reached a reader's screen looking deliberate.
  assert.equal(relationGroupLabel("some_future_edge", "out"), "Related to");
  assert.equal(relationGroupLabel("some_future_edge", "in"), "Related to");
  assert.ok(!relationGroupLabel("mystery_edge", "out").includes("_"));
});

test("the whole surface uses only the eight nomenclature words", () => {
  // What makes this a vocabulary rather than a smaller pile of strings:
  // nothing may return a word the nomenclature does not declare.
  const allowed = new Set(
    Object.values(LINK_LABEL).flatMap((p) => [p.out, p.in]),
  );
  assert.equal(allowed.size, 7, "four pairs, with Related to shared, is 7 words");
  const edgeTypes = [
    "composed_of",
    "uses_component",
    "in_app",
    "in_category",
    "narrower",
    "a11y_ref",
    "foundations_ref",
    "motion_ref",
    "related",
    "entity_related",
    "term_about",
    "totally_unknown",
  ];
  for (const t of edgeTypes) {
    for (const d of ["in", "out"] as const) {
      assert.ok(
        allowed.has(relationGroupLabel(t, d)),
        `${t}:${d} returned "${relationGroupLabel(t, d)}", outside the nomenclature`,
      );
    }
  }
});

test("groupGraphNeighbors buckets neighbours under their relationship", () => {
  const neighbors: Neighbor[] = [
    neighbor("category:action", "category", "in_category", "out"),
    neighbor("component:modal", "component", "composed_of", "in"),
    neighbor("component:page-header", "component", "composed_of", "in"),
    neighbor("pattern:import-wizard", "ux_pattern", "uses_component", "in"),
    neighbor("a11y:buttons", "a11y_criterion", "a11y_ref", "out"),
    neighbor("component:spinner", "component", "composed_of", "out"),
  ];
  const groups = groupGraphNeighbors(neighbors);
  const byLabel = new Map(groups.map((g) => [g.label, g.items]));

  // composed_of:in and uses_component:in are the same relationship seen from
  // the same side, so they now share one group rather than splitting into
  // "Appears in" and "Used in patterns".
  assert.deepEqual(
    byLabel.get("Used in")!.map((n) => n.node!.title),
    ["modal", "page-header", "import-wizard"],
    "every inbound composition neighbour lands under Used in, in order",
  );
  assert.equal(byLabel.get("Built from")!.length, 1);
  assert.equal(byLabel.get("Part of")!.length, 1);
  assert.equal(byLabel.get("Must follow")!.length, 1);
});

test("group labels never contain internal edge-type keys", () => {
  const neighbors: Neighbor[] = [
    neighbor("category:action", "category", "in_category", "out"),
    neighbor("component:modal", "component", "composed_of", "in"),
    neighbor("pattern:x", "ux_pattern", "uses_component", "in"),
  ];
  for (const g of groupGraphNeighbors(neighbors)) {
    for (const banned of ["in_category", "composed_of", "uses_component", "_"]) {
      assert.ok(
        !g.label.includes(banned),
        `group label "${g.label}" leaked "${banned}"`,
      );
    }
  }
});

test("groups are ordered by author priority: what this record IS before the incoming crowds", () => {
  const neighbors: Neighbor[] = [
    neighbor("component:modal", "component", "composed_of", "in"), // Used in
    neighbor("category:action", "category", "in_category", "out"), // Part of
    neighbor("component:spinner", "component", "composed_of", "out"), // Built from
  ];
  const labels = groupGraphNeighbors(neighbors).map((g) => g.label);
  assert.ok(
    labels.indexOf("Part of") < labels.indexOf("Used in"),
    `Part of should precede Used in, got ${labels.join(", ")}`,
  );
  assert.ok(
    labels.indexOf("Built from") < labels.indexOf("Used in"),
    `Built from should precede Used in, got ${labels.join(", ")}`,
  );
});

test("GROUP_ORDER covers every word the vocabulary can produce", () => {
  // The first version of this test built four neighbours that ALL had the same
  // edge type and direction, so they bucketed into one group and it asserted
  // that single label was allowed. Deleting an entry from GROUP_ORDER, or
  // reordering it entirely, left it green — a guard that cannot fail.
  //
  // This is the check that actually holds: every word LINK_LABEL can produce
  // must be ranked, or adding a fifth family silently sorts it last, which is
  // precisely the coupling the old hand-copied list was warned about.
  const words = new Set(
    Object.values(LINK_LABEL).flatMap((p) => [p.out, p.in]),
  );
  const ranked = new Set(rankedLabels());
  for (const w of words) {
    assert.ok(ranked.has(w), `"${w}" is produced by the vocabulary but unranked`);
  }
});

test("groups sort by rank, proved with a mix of families and directions", () => {
  // Mixed on purpose: one neighbour per family per direction, shuffled, so the
  // assertion is about ORDER and not about which single bucket they land in.
  const neighbors: Neighbor[] = [
    neighbor("a", "component", "composed_of", "in"), // Used in
    neighbor("b", "a11y_criterion", "a11y_ref", "out"), // Must follow
    neighbor("c", "category", "in_category", "out"), // Part of
    neighbor("d", "component", "composed_of", "out"), // Built from
    neighbor("e", "component", "related", "out"), // Related to
    neighbor("f", "component", "in_category", "in"), // Contains
  ];
  const got = groupGraphNeighbors(neighbors).map((g) => g.label);
  const want = rankedLabels().filter((l) => got.includes(l));
  assert.deepEqual(got, want, "groups must come back in GROUP_ORDER order");
  assert.ok(got.length >= 5, `expected several distinct groups, got ${got.join(", ")}`);
});
