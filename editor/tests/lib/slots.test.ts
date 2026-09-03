// Every `filled` test is asserted against a known-filled AND a known-empty
// REAL record. A test that only asserts the aggregate count passes when the
// tables are empty, which is the one failure mode a completeness model cannot
// afford: it would report a healthy substrate by measuring nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  buildPatternIndex,
  type AppContextDoc,
  type RecipeDoc,
} from "../../src/lib/patternIndex";
import {
  PATTERN_SLOTS,
  ENTITY_SLOTS,
  PRODUCT_SLOTS,
  TERM_SLOTS,
  patternSlotRecords,
  entitySlotRecords,
  productSlotRecords,
  termSlotRecords,
  wordCount,
  DESCRIPTION_MIN_WORDS,
  type PatternSlotRecord,
} from "../../src/lib/slots";
import { SLOT_LABEL } from "../../src/lib/nomenclature";
import {
  COMPONENT_SLOTS,
  componentSlotRecords,
  componentSlotsFor,
} from "../../src/lib/slots";
import { DOMAINS, type CoverageRow } from "../../src/lib/coverageLoader";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function realDoc(): AppContextDoc {
  return JSON.parse(
    readFileSync(join(REPO, "app-context", "dist", "app-context.json"), "utf8"),
  ) as AppContextDoc;
}

function realRecipes(): RecipeDoc[] {
  const dir = join(REPO, "app-context", "dist", "recipes");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as RecipeDoc);
}

function records(): PatternSlotRecord[] {
  const rs = patternSlotRecords(buildPatternIndex(realDoc(), realRecipes()));
  assert.ok(rs.length > 0, "no Pattern records — every check below is vacuous");
  return rs;
}

function bySlug(rs: PatternSlotRecord[], slug: string): PatternSlotRecord {
  const r = rs.find((x) => x.slug === slug);
  assert.ok(r, `${slug} is not in the corpus — this test names a record that left`);
  return r;
}

/**
 * Does this help text name that record?
 *
 * A whole-token match, NOT `String.includes`. Substring matching made this
 * check tautological: "The fields this entity carries" matches the entity slug
 * `field`, so every help string containing an ordinary English word that
 * happens to be a slug passed — proved by injecting a bogus example and
 * watching the guard stay green. Eight entity slugs are short common words
 * (field, domain, topic, contact, dataset, lineage, scanner, api-key).
 *
 * Hyphens count as part of the token, so `access-request` does not match
 * inside `access-request-management` — a help text should name the record it
 * actually means.
 */
function namesRecord(help: string, slug: string): boolean {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(help);
}

function authoredComponentSlugs(): string[] {
  return readdirSync(join(REPO, "components", "src"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "categories" && e.name !== "guidelines")
    .map((e) => e.name);
}

function slot(key: string) {
  const s = PATTERN_SLOTS.find((x) => x.key === key);
  assert.ok(s, `no Pattern Slot keyed ${key}`);
  return s;
}

test("Rule is filled by a when clause, and empty without one", () => {
  const rs = records();
  const s = slot("rule");
  assert.equal(s.filled(bySlug(rs, "access-request-management")), true);
  assert.equal(s.filled(bySlug(rs, "access-request-workflow")), false);
  assert.equal(rs.filter((r) => s.filled(r)).length, 14);
});

test("Description is filled at 40 words, the gap the corpus already has", () => {
  const rs = records();
  const s = slot("description");
  // The bar is not arbitrary: bodies run 8-18 words, then nothing until 40.
  const lengths = rs.map((r) => wordCount(r.description)).sort((a, b) => a - b);
  const below = lengths.filter((n) => n > 0 && n < DESCRIPTION_MIN_WORDS);
  const above = lengths.filter((n) => n >= DESCRIPTION_MIN_WORDS);
  assert.ok(below.length > 0 && above.length > 0, "corpus is not bimodal any more");
  assert.ok(
    Math.max(...below) < Math.min(...above) - 15,
    `the gap has closed: ${Math.max(...below)} then ${Math.min(...above)} — re-derive the bar rather than keeping it`,
  );
  assert.equal(rs.filter((r) => s.filled(r)).length, 13);
});

test("Built from and Used in read the pattern's own lists", () => {
  const rs = records();
  assert.equal(rs.filter((r) => slot("built_from").filled(r)).length, 29);
  assert.equal(rs.filter((r) => slot("used_in").filled(r)).length, 31);
});

test("Job is a cross-file join: a Product's use case must name the pattern", () => {
  const rs = records();
  const s = slot("job");
  // search-filtered-table is named by a Studio use case; ai-analyst-panel
  // claims an app but no use case reaches it.
  assert.equal(s.filled(bySlug(rs, "search-filtered-table")), true);
  assert.equal(s.filled(bySlug(rs, "ai-analyst-panel")), false);
  assert.equal(rs.filter((r) => s.filled(r)).length, 10);
});

test("Job is not the same question as Used in", () => {
  // Both are about apps, and conflating them is easy. A pattern can claim an
  // app (Used in) while no use case in that app names it (Job) — that gap IS
  // the finding, and a Slot table that merged them would report it as filled.
  const rs = records();
  const claimed = rs.filter((r) => slot("used_in").filled(r)).length;
  const reached = rs.filter((r) => slot("job").filled(r)).length;
  assert.ok(reached < claimed, "Job and Used in have collapsed into one measure");
});

test("Capture reads the recipe's declared pattern, not its filename", () => {
  const rs = records();
  const s = slot("capture");
  // studio-quick-edit-drawer.json is a capture of right-sliding-drawer taken on
  // a different surface. A filename join would miss it, and would go on
  // reporting the right total by coincidence.
  assert.equal(s.filled(bySlug(rs, "right-sliding-drawer")), true);
  assert.equal(bySlug(rs, "right-sliding-drawer").captureCount, 2);
  assert.equal(s.filled(bySlug(rs, "activity-timeline")), false);
  assert.equal(rs.filter((r) => s.filled(r)).length, 3);
  // Four recipes, three patterns covered. Asserting both keeps the difference
  // visible instead of letting one number stand for the other.
  assert.equal(realRecipes().length, 4);
});

test("Tags is filled by a non-empty tag list", () => {
  const rs = records();
  assert.equal(rs.filter((r) => slot("tags").filled(r)).length, 30);
});

test("every Pattern Slot takes its name from the vocabulary", () => {
  for (const s of PATTERN_SLOTS) {
    assert.equal(s.name, SLOT_LABEL[s.key], `${s.key} restates its own name`);
  }
});

test("every Slot's help names a real record, in every table", () => {
  // Honesty rule 5: help must point at an example that exists. A help string
  // naming a record that has left the corpus is worse than none.
  //
  // Over ALL four tables, not just the one where the rule was first written
  // down. A guard whose subject is the place a defect was last seen is how the
  // same vocabulary drift recurred five times in P1.
  const doc = realDoc();
  const corpora: ReadonlyArray<readonly [string, string[], { key: string; help: string }[]]> = [
    ["Pattern", records().map((r) => r.slug), PATTERN_SLOTS],
    ["Entity", entitySlotRecords(doc).map((r) => r.slug), ENTITY_SLOTS],
    ["Product", productSlotRecords(doc).map((r) => r.slug), PRODUCT_SLOTS],
    ["Term", termSlotRecords(doc).map((r) => r.slug), TERM_SLOTS],
    // The Component corpus is the authored directories on disk. Included so
    // the guard's subject is every table, not the four whose helps happened to
    // be written first.
    ["Component", authoredComponentSlugs(), COMPONENT_SLOTS],
  ];
  for (const [thing, slugs, table] of corpora) {
    assert.ok(slugs.length > 0, `${thing} corpus is empty — the check is vacuous`);
    assert.ok(table.length > 0, `${thing} has no Slots — the check is vacuous`);
    for (const s of table) {
      assert.ok(
        slugs.some((slug) => namesRecord(s.help, slug)),
        `${thing}.${s.key}'s help names no record in its corpus: "${s.help}"`,
      );
    }
  }
});

test("Entity has exactly three Slots, and no Description", () => {
  // Decided on #644: Entity bodies run 5-38 words with no gap anywhere, so
  // every word-count bar is a guess. The Pattern bar would report 0 of 30 and
  // read as a system-wide failure rather than a measurement.
  assert.deepEqual(
    ENTITY_SLOTS.map((s) => s.key),
    ["properties", "link", "used_in"],
  );
  assert.ok(
    !ENTITY_SLOTS.some((s) => s.key === "description"),
    "Entity must not gain a Description Slot without reopening #644",
  );
});

test("Entity Slots are filled and empty on known real records", () => {
  const rs = entitySlotRecords(realDoc());
  assert.ok(rs.length > 0, "no Entity records — vacuous");
  const find = (slug: string) => {
    const r = rs.find((x) => x.slug === slug);
    assert.ok(r, `${slug} left the corpus`);
    return r;
  };
  const s = (k: string) => {
    const f = ENTITY_SLOTS.find((x) => x.key === k);
    assert.ok(f, `no Entity Slot ${k}`);
    return f;
  };
  assert.equal(s("properties").filled(find("access-request")), true);
  assert.equal(s("properties").filled(find("input-port")), false);
  assert.equal(s("link").filled(find("access-request")), true);
  assert.equal(s("link").filled(find("api-key")), false);
  assert.equal(s("used_in").filled(find("access-request")), true);

  assert.equal(rs.filter((r) => s("properties").filled(r)).length, 26);
  assert.equal(rs.filter((r) => s("link").filled(r)).length, 22);
  assert.equal(rs.filter((r) => s("used_in").filled(r)).length, 30);
});

test("Entity Link counts a relationship map with any verb", () => {
  // The verbs are open. A parse keyed to a closed lowercase list read 11 of 30
  // instead of 22, because belongsTo, relatesTo, appliesTo, subtypeOf and
  // derivedFrom are camelCase and the pattern only matched lowercase.
  const rs = entitySlotRecords(realDoc());
  const verbs = new Set(rs.flatMap((r) => r.relationshipVerbs));
  assert.ok(verbs.size > 5, `only ${verbs.size} verbs seen — the parse is narrow`);
  assert.ok(verbs.has("belongsTo"), "camelCase verbs are being dropped");
});

test("Product Navigation is the one Product Slot that is not full", () => {
  const rs = productSlotRecords(realDoc());
  assert.equal(rs.length, 3);
  const nav = PRODUCT_SLOTS.find((s) => s.key === "navigation");
  assert.ok(nav);
  const find = (slug: string) => {
    const r = rs.find((x) => x.slug === slug);
    assert.ok(r, `${slug} left the corpus`);
    return r;
  };
  assert.equal(nav.filled(find("studio")), true);
  assert.equal(nav.filled(find("explorer")), false);
  assert.equal(rs.filter((r) => nav.filled(r)).length, 2);
  // Every other Product Slot is 3/3 today. Asserting that keeps a regression
  // visible rather than only tracking the one known gap.
  for (const s of PRODUCT_SLOTS) {
    if (s.key === "navigation") continue;
    assert.equal(rs.filter((r) => s.filled(r)).length, 3, `${s.key} moved`);
  }
});

test("Product Signals is a keyword list, and its help says so", () => {
  // The design doc read the field name as "behavioural signals" and described
  // it as how a product tells a user something happened. The corpus says
  // otherwise: studio carries steward, govern, curate, lineage — the words that
  // route a request to this product, the same job Pattern tags do. Help text is
  // read by an author, so the shape decides the wording.
  const rs = productSlotRecords(realDoc());
  const studio = rs.find((r) => r.slug === "studio");
  assert.ok(studio);
  assert.ok(studio.signals.includes("steward"), "signals is not the keyword list");
  const s = PRODUCT_SLOTS.find((x) => x.key === "signals");
  assert.ok(s);
  assert.ok(
    !/tells a user|feedback|happened/i.test(s.help),
    `Signals help still describes UI feedback: "${s.help}"`,
  );
});

test("Term Slots are full, and the predicate still rejects an empty record", () => {
  // Both Term Slots are 33/33, so no known-empty REAL record exists. Asserting
  // only the count would leave a predicate that returns true unconditionally
  // looking correct. The synthetic half is stated here on purpose.
  const rs = termSlotRecords(realDoc());
  assert.equal(rs.length, 33);
  for (const s of TERM_SLOTS) {
    assert.equal(rs.filter((r) => s.filled(r)).length, 33, `${s.key} is no longer full`);
    assert.equal(
      s.filled({ slug: "synthetic", label: "Synthetic", meaning: "", notUse: [] }),
      false,
      `${s.key} returns true for an empty record`,
    );
  }
});

test("every Slot in every table takes its name from the vocabulary", () => {
  for (const table of [PATTERN_SLOTS, ENTITY_SLOTS, PRODUCT_SLOTS, TERM_SLOTS]) {
    for (const s of table) {
      assert.equal(s.name, SLOT_LABEL[s.key], `${s.key} restates its own name`);
    }
  }
});

function fixtureCoverageRows(): CoverageRow[] {
  return [
    {
      slug: "button",
      component: "Button",
      origin: "authored",
      a11yRefs: ["1.4.3"],
      domains: {
        content: { status: "approved" },
        usage: { status: "draft" },
        design: { status: "inherited" },
        behavior: { status: "not-started" },
        tokens: { status: "not-started" },
      },
    },
    {
      slug: "ghost",
      component: "Ghost",
      origin: "unstarted",
      a11yRefs: [],
      domains: {
        content: { status: "not-started" },
        usage: { status: "not-started" },
        design: { status: "not-started" },
        behavior: { status: "not-started" },
        tokens: { status: "not-started" },
      },
    },
  ];
}

test("a Component domain Slot is filled by any status but not-started", () => {
  const rs = componentSlotRecords(fixtureCoverageRows(), new Set(["button"]));
  const s = (k: string) => {
    const f = COMPONENT_SLOTS.find((x) => x.key === k);
    assert.ok(f, `no Component Slot ${k}`);
    return f;
  };
  const button = rs.find((r) => r.slug === "button");
  const ghost = rs.find((r) => r.slug === "ghost");
  assert.ok(button && ghost);

  // `inherited` counts as filled: the guidance exists, it just lives on the
  // category. Counting it as a gap would send an author to write a file the
  // system deliberately does not want.
  assert.equal(s("design").filled(button), true);
  assert.equal(s("content").filled(button), true);
  assert.equal(s("usage").filled(button), true);
  assert.equal(s("behavior").filled(button), false);
  assert.equal(s("content").filled(ghost), false);

  assert.equal(s("must_follow").filled(button), true);
  assert.equal(s("must_follow").filled(ghost), false);
  assert.equal(s("capture").filled(button), true);
  assert.equal(s("capture").filled(ghost), false);
});

test("the Component table covers every domain the loader knows", () => {
  // A hand-written Slot list that falls behind DOMAINS would silently stop
  // measuring a domain. Assert the join rather than the list.
  const domainKeys = COMPONENT_SLOTS.map((s) => s.key).filter((k) =>
    (DOMAINS as readonly string[]).includes(k),
  );
  assert.deepEqual([...domainKeys].sort(), [...DOMAINS].sort());
});

test("an empty capture set means no captures are known", () => {
  const rs = componentSlotRecords(fixtureCoverageRows(), new Set());
  const capture = COMPONENT_SLOTS.find((s) => s.key === "capture");
  assert.ok(capture);
  assert.equal(rs.filter((r) => capture.filled(r)).length, 0);
});

test("an unmeasurable capture index DROPS the Slot rather than reporting zero", () => {
  // loadMediaIndex's own rule: a failed read must not come back as "this
  // component has no media". Passing an empty set on failure would report
  // `Capture 0 of 73`, which is a lie with a number on it — worse than saying
  // nothing, because it reads as a gap somebody should go and fill.
  const measured = componentSlotsFor(true).map((s) => s.key);
  const unmeasured = componentSlotsFor(false).map((s) => s.key);
  assert.ok(measured.includes("capture"));
  assert.ok(!unmeasured.includes("capture"));
  // Everything else survives: one unreadable index must not blank the rest.
  assert.deepEqual(
    unmeasured,
    measured.filter((k) => k !== "capture"),
  );
});
