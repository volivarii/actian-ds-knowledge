// The editor's controlled vocabulary. One word per concept, no synonyms
// anywhere. These tests are the enforcement: a second word for a concept that
// already has one fails here rather than reaching a screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  THING_LABEL,
  STATE_LABEL,
  ACTION_LABEL,
  LINK_LABEL,
  LINK_FAMILY,
} from "../../src/lib/nomenclature";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function graph(): { nodes: Array<{ type: string }>; edges: Array<{ type: string }> } {
  return JSON.parse(
    readFileSync(join(REPO, "graph", "dist", "graph.json"), "utf8"),
  );
}

test("every graph node type has exactly one Thing word", () => {
  assert.equal(THING_LABEL.component, "Component");
  assert.equal(THING_LABEL.category, "Category");
  assert.equal(THING_LABEL.foundation_section, "Foundation");
  assert.equal(THING_LABEL.a11y_criterion, "Criterion");
  assert.equal(THING_LABEL.content_topic, "Topic");
  assert.equal(THING_LABEL.motion_pattern, "Motion");
  assert.equal(THING_LABEL.app, "Product");
  assert.equal(THING_LABEL.ux_pattern, "Pattern");
  assert.equal(THING_LABEL.app_entity, "Entity");
  assert.equal(THING_LABEL.terminology_term, "Term");
});

test("states are the one vocabulary, not two", () => {
  assert.deepEqual(Object.values(STATE_LABEL).sort(), [
    "Approved",
    "Draft",
    "Empty",
    "Inherited",
  ]);
});

test("actions are six verbs", () => {
  assert.deepEqual(Object.values(ACTION_LABEL).sort(), [
    "Edit",
    "Jump",
    "Open",
    "Reveal",
    "Stage",
    "Submit",
  ]);
});

test("links are reciprocal pairs, so each edge reads from either end", () => {
  assert.deepEqual(LINK_LABEL.composition, { out: "Built from", in: "Used in" });
  assert.deepEqual(LINK_LABEL.membership, { out: "Part of", in: "Contains" });
  assert.deepEqual(LINK_LABEL.compliance, {
    out: "Must follow",
    in: "Required by",
  });
  assert.deepEqual(LINK_LABEL.association, {
    out: "Related to",
    in: "Related to",
  });
});

test("no word is used for two different concepts", () => {
  // A synonym check in the other direction: the same string appearing as both
  // a Thing and a State (or any other cross-category reuse) is the ambiguity
  // this module exists to prevent.
  const things = new Set(Object.values(THING_LABEL));
  const states = new Set(Object.values(STATE_LABEL));
  const actions = new Set(Object.values(ACTION_LABEL));
  for (const s of states)
    assert.ok(!things.has(s), `"${s}" is both a Thing and a State`);
  for (const a of actions)
    assert.ok(!things.has(a), `"${a}" is both a Thing and an Action`);
  for (const a of actions)
    assert.ok(!states.has(a), `"${a}" is both a State and an Action`);
});

test("Thing words are singular and carry no qualifier", () => {
  // "Accessibility criterion", "Content topic" and "Motion pattern" were the
  // old two-word labels; the nomenclature collapses each to one word.
  for (const w of Object.values(THING_LABEL)) {
    assert.ok(!w.includes(" "), `"${w}" is not a single word`);
  }
});

test("every edge type the real graph emits has a Link family", () => {
  // The failure this prevents: a new edge type ships, falls through to the
  // association fallback, and reads as "Related to" forever with every test
  // green. Asserting against the real graph is the only way to see it.
  const real = new Set(graph().edges.map((e) => e.type));
  assert.ok(real.size > 0, "graph.json carried no edges — the join is vacuous");
  const missing = [...real].filter((t) => !(t in LINK_FAMILY));
  assert.deepEqual(missing, [], `edge types with no Link family: ${missing}`);
});

test("no Link family is declared for an edge type the graph never emits", () => {
  const real = new Set(graph().edges.map((e) => e.type));
  const dead = Object.keys(LINK_FAMILY).filter((t) => !real.has(t));
  assert.deepEqual(dead, [], `dead config for absent edge types: ${dead}`);
});

test("every node type the real graph emits has a Thing word", () => {
  const real = new Set(graph().nodes.map((n) => n.type));
  assert.ok(real.size > 0, "graph.json carried no nodes — the join is vacuous");
  const missing = [...real].filter((t) => !(t in THING_LABEL));
  assert.deepEqual(missing, [], `node types with no Thing word: ${missing}`);
});
