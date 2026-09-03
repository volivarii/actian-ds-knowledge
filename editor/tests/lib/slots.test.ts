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
  patternSlotRecords,
  wordCount,
  DESCRIPTION_MIN_WORDS,
  type PatternSlotRecord,
} from "../../src/lib/slots";
import { SLOT_LABEL } from "../../src/lib/nomenclature";

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

test("every Pattern Slot's help names a real record", () => {
  // Honesty rule 5: help must point at an example that exists. A help string
  // naming a record that has left the corpus is worse than none.
  const rs = records();
  const slugs = new Set(rs.map((r) => r.slug));
  for (const s of PATTERN_SLOTS) {
    const named = [...slugs].filter((slug) => s.help.includes(slug));
    assert.ok(
      named.length > 0,
      `${s.key}'s help names no record in the corpus: "${s.help}"`,
    );
  }
});
