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
  STATE_FOR_STATUS,
  type SubstrateStatus,
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
      block.includes("STATE_FOR_STATUS"),
      `${name}'s STATUS_LABEL does not read STATE_FOR_STATUS`,
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

/**
 * Retired PHRASES, and the word that replaced each.
 *
 * One guard over the whole tree, rather than a per-file check per rename. Two
 * review rounds found the same shape of defect five times — searchIndex still
 * said "Feature", the app uiSchema still said "App settings",
 * WorkspaceDomainEditor still said "Not started" — each time because the
 * guard's subject was a file someone had already fixed rather than the word.
 *
 * WHAT THIS CANNOT COVER, stated rather than implied: a bare lowercase `app`,
 * `authored` or `unstarted` is not checkable from source, because those are the
 * substrate's OWN identifiers — the `apps:` frontmatter key, the
 * `app-context/src/apps` directory, the `authored` domain status — and appear
 * in paths, object keys and types far more often than in copy. Every phrase
 * below is one a reader sees and a compiler never needs. The rendered-text
 * check that would cover the rest is `tests/app/nomenclatureRenders.test.tsx`,
 * which asserts on `container.textContent` and cannot be fooled by an
 * identifier; it covers the app-context record screens today.
 */
const RETIRED_PHRASES: ReadonlyArray<
  readonly [pattern: RegExp, use: string]
> = [
  [/\bFeatures?\b/, "Pattern"],
  [/\bApp settings\b/, "Product settings"],
  [/\bNot started\b/, "Empty"],
  [/\bAccessibility criterion\b/, "Criterion"],
  [/\bContent topic\b/, "Topic"],
  [/\bMotion pattern\b/, "Motion"],
  // "Application context" is the domain's own name — the sidebar dimension —
  // not the Thing word, so it is excluded rather than exempted per-file.
  [/\bApplication\b(?! context)/, "Product"],
];

/**
 * Where a retired phrase may still legitimately appear. Each entry names a file
 * AND a reason — an exemption is a decision, not a convenience.
 */
const PHRASE_EXEMPT: ReadonlyArray<readonly [rel: string, why: string]> = [
  [
    "lib/routes.ts",
    "carries the retired #/feature/ alias so links shared before the rename keep resolving",
  ],
  ["lib/nomenclature.ts", "declares the vocabulary, so it names what it retired"],
];

test("the retired-phrase patterns actually match what they ban", () => {
  // Proving the guard is not vacuous WITHOUT requiring a defect to exist. The
  // first version asserted that some file still matched, which fails the moment
  // the tree is clean — a check that only passes while broken.
  const shouldMatch: ReadonlyArray<readonly [string, string]> = [
    ['const label = "Features";', "Pattern"],
    ['title: "App settings",', "Product settings"],
    ["<Badge>Not started</Badge>", "Empty"],
    ["Accessibility criterion", "Criterion"],
    ["Content topic", "Topic"],
    ["Motion pattern", "Motion"],
    ['relationTypeLabel(t) === "Application"', "Product"],
  ];
  for (const [sample, use] of shouldMatch) {
    const hit = RETIRED_PHRASES.find(([re]) => re.test(sample));
    assert.ok(hit, `no pattern matches ${sample}`);
    assert.equal(hit![1], use, `${sample} should be corrected to ${use}`);
  }
  // And the exclusions hold: these must NOT match.
  for (const ok of [
    "Application context",           // the domain's own name
    "buildFeatureStub(opts)",        // camelCase identifier
    "app-context/src/apps",          // a repository path
    'status === "not-started"', // the substrate's own identifier
  ]) {
    const hit = RETIRED_PHRASES.find(([re]) => re.test(ok));
    assert.equal(hit, undefined, `"${ok}" must not be flagged (matched ${hit?.[0]})`);
  }
});

test("no editor source shows a retired phrase to a reader", () => {
  const SRC = join(REPO, "editor", "src");
  const exemptRel = new Set(PHRASE_EXEMPT.map(([rel]) => rel));

  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "generated") walk(full);
      } else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
    }
  })(SRC);
  assert.ok(files.length > 40, `walked only ${files.length} files — vacuous`);
  // Every exemption must name a file the walk actually produced, or the list
  // rots into an allow-all as files move.
  for (const [rel] of PHRASE_EXEMPT) {
    assert.ok(
      files.includes(join(SRC, rel)),
      `PHRASE_EXEMPT names ${rel}, which the walk never produced`,
    );
  }
  const offenders: string[] = [];
  for (const f of files) {
    const rel = f.slice(SRC.length + 1);
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const [re, use] of RETIRED_PHRASES) {
      if (exemptRel.has(rel)) continue;
      const hit = src.match(re);
      if (hit) offenders.push(`${rel}: "${hit[0]}" — say "${use}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `sources still showing a retired phrase:\n${offenders.join("\n")}`,
  );
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

test("every substrate status has a word, and it is the same word everywhere", () => {
  // STATE_LABEL is the one map with no graph to join to — its keys are
  // invented, not substrate identifiers. This is the join it CAN have: every
  // status either loader emits maps to a word, and both consuming screens read
  // the same map rather than each building a Record of their own.
  const statuses: SubstrateStatus[] = [
    "not-started",
    "authored",
    "draft",
    "approved",
    "inherited",
  ];
  for (const st of statuses) {
    assert.equal(typeof STATE_FOR_STATUS[st], "string", `${st} has no word`);
    assert.ok(
      Object.values(STATE_LABEL).includes(STATE_FOR_STATUS[st]),
      `${st} maps to "${STATE_FOR_STATUS[st]}", which is not one of the four States`,
    );
  }
  // authored and draft are the two loaders' names for the same thing.
  assert.equal(STATE_FOR_STATUS.authored, STATE_FOR_STATUS.draft);
  assert.equal(STATE_FOR_STATUS["not-started"], STATE_LABEL.empty);
});
