// The editor's controlled vocabulary. One word per concept, no synonyms
// anywhere. These tests are the enforcement: a second word for a concept that
// already has one fails here rather than reaching a screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  THING_LABEL,
  STATE_LABEL,
  LINK_LABEL,
  LINK_FAMILY,
  linkLabel,
  thingLabel,
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
  const links = new Set(
    Object.values(LINK_LABEL).flatMap((p) => [p.out, p.in]),
  );
  for (const w of states)
    assert.ok(!things.has(w), `"${w}" is both a Thing and a State`);
  // Links were NOT compared against Things before, so the Thing rename to
  // "Motion" could collide with an edge label of the same word and the check
  // stayed green.
  for (const w of links)
    assert.ok(!things.has(w), `"${w}" is both a Thing and a Link`);
  for (const w of links)
    assert.ok(!states.has(w), `"${w}" is both a State and a Link`);
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
  // WALKS THE TREE. The first version of this guard iterated a hand-written
  // list of six paths — the files the author had already fixed — and gave a
  // false all-clear while `src/lib/searchIndex.ts` still labelled every
  // app-context pattern "Feature" in the global search dropdown. That is
  // exactly `feedback_replace_the_list_with_the_read`: a stale list iterated
  // against real data does not go red, it makes the loop body never run.
  //
  // Comments are stripped first: the guard's subject is what the editor CALLS
  // things, and Sidebar keeps a note recording the retired word on purpose.
  const SRC = join(REPO, "editor", "src");
  const EXEMPT = new Set([
    // Carries a RETIRED_DIRS alias that must literally contain "feature", so a
    // link shared before the rename keeps resolving. routes.test.ts asserts it
    // still resolves and is never minted.
    join(SRC, "lib", "routes.ts"),
    // Generated substrate prose, not editor copy.
    join(SRC, "generated", "search-bodies.json"),
  ]);
  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
    }
  })(SRC);
  assert.ok(files.length > 40, `walked only ${files.length} files — vacuous`);

  const offenders: string[] = [];
  for (const f of files) {
    if (EXEMPT.has(f)) continue;
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const hits = src.match(/\bfeatures?\b/gi) ?? [];
    if (hits.length) offenders.push(`${f.slice(SRC.length + 1)}: "${hits[0]}"`);
  }
  assert.deepEqual(offenders, [], `sources still saying Feature:\n${offenders.join("\n")}`);
});

test("membership orientation is checked against the graph's own shape", () => {
  // Orientation was got wrong twice: `in_app` in the design doc, `narrower` in
  // the first implementation, both because a plain edgeType -> family map
  // assumes every edge in a family points the same way. Membership edges do
  // not. This asserts the direction from the DATA rather than restating the
  // claim: `narrower` ids are hierarchical, so a parent -> child edge has the
  // target prefixed by the source.
  const edges = graph().edges as Array<{ type: string; from?: string; to?: string; source?: string; target?: string }>;
  const narrower = edges.filter((e) => e.type === "narrower");
  assert.ok(narrower.length > 0, "no narrower edges — the check is vacuous");
  const parentToChild = narrower.filter((e) => {
    const from = e.from ?? e.source ?? "";
    const to = e.to ?? e.target ?? "";
    return to.startsWith(`${from}/`);
  });
  assert.equal(
    parentToChild.length,
    narrower.length,
    "every narrower edge should run parent -> child",
  );
  // Parent -> child means the SOURCE contains the target, so from the source's
  // side the outbound word is Contains, not Part of.
  assert.equal(linkLabel("narrower", "out"), LINK_LABEL.membership.in);
  assert.equal(linkLabel("narrower", "in"), LINK_LABEL.membership.out);
  assert.ok(LINK_FAMILY.narrower!.flipped, "narrower must be marked flipped");

  // in_category runs the other way (component -> category), so it is NOT
  // flipped and reads Part of outbound.
  assert.equal(linkLabel("in_category", "out"), LINK_LABEL.membership.out);
  assert.ok(!LINK_FAMILY.in_category!.flipped);
});

test("an inherited key cannot crash or leak a Function", () => {
  // LINK_FAMILY["constructor"] is truthy by inheritance, so a `??` fallback
  // never fired and linkLabel threw instead of returning "Related to".
  for (const evil of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    assert.equal(typeof thingLabel(evil), "string", `thingLabel(${evil})`);
    assert.equal(thingLabel(evil), "Node");
    assert.equal(linkLabel(evil, "out"), LINK_LABEL.association.out);
    assert.equal(linkLabel(evil, "in"), LINK_LABEL.association.in);
  }
});
