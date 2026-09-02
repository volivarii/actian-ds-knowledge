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

test("the workspace and the coverage table use the same word for a state", () => {
  // The defect this closes: `approved` rendered as "Approved" in
  // AuthoringWorkspace and "ready" in CoverageDashboard; `not-started` as
  // "Not started" and as "—". Both files now read the same map, so the two
  // can no longer drift.
  //
  // Scoped to the STATUS_LABEL declaration rather than the whole file. A
  // whole-file scan matched AuthoringWorkspace's `kind: "ready"` loading
  // discriminant, which has nothing to do with a domain status — a guard that
  // fails on the wrong subject teaches people to weaken it.
  const files = [
    ["AuthoringWorkspace", join(REPO, "editor", "src", "app", "AuthoringWorkspace.tsx")],
    ["CoverageDashboard", join(REPO, "editor", "src", "app", "CoverageDashboard.tsx")],
  ] as const;
  for (const [name, path] of files) {
    const src = readFileSync(path, "utf8");
    const start = src.indexOf("const STATUS_LABEL");
    assert.notEqual(start, -1, `${name} has no STATUS_LABEL to check`);
    const block = src.slice(start, src.indexOf("};", start) + 2);
    assert.ok(
      block.includes("STATE_LABEL."),
      `${name}'s STATUS_LABEL does not read STATE_LABEL`,
    );
    for (const stale of [
      '"ready"',
      '"draft"',
      '"Not started"',
      '"Authored — in batch / remote"',
      '"Inherited from category"',
      '"—"',
    ]) {
      assert.ok(
        !block.includes(stale),
        `${name}'s STATUS_LABEL still declares the retired label ${stale}`,
      );
    }
  }
});

test("no editor source calls an app-context pattern a Feature", () => {
  // The rename that stops at the namespace boundary: the display label was one
  // line, the concept was seven files. This walks the source so the next one
  // cannot stop halfway.
  //
  // `src/lib/routes.ts` is deliberately ABSENT: it carries a RETIRED_DIRS
  // entry that must literally contain "feature", because a parallel-change
  // alias is the whole point. routes.test.ts covers it instead, asserting that
  // #/feature/ still RESOLVES and is never MINTED.
  const roots = [
    ["src", "lib", "createContextRecord.ts"],
    ["src", "lib", "contextRecords.ts"],
    ["src", "lib", "appContextCreate.ts"],
    ["src", "app", "Sidebar.tsx"],
    ["src", "app", "NewContextRecordDialog.tsx"],
    ["src", "app", "NewProductDialog.tsx"],
  ];
  for (const parts of roots) {
    const raw = readFileSync(join(REPO, "editor", ...parts), "utf8");
    // Comments are stripped first. The guard's subject is what the editor
    // CALLS things — identifiers and copy — not what a note explains. Sidebar
    // keeps a comment recording that "Features" was a word the editor invented
    // for itself, and that history is worth keeping; a guard that forbids
    // naming the thing it retired makes the record impossible to write.
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Whole word only, case-insensitively: substrate content such as
    // `featured-properties` is unrelated and must not trip this.
    const hits = src.match(/\bfeatures?\b/gi) ?? [];
    assert.deepEqual(
      hits,
      [],
      `${parts.join("/")} still says "${hits[0]}" for an app-context pattern`,
    );
  }
});
