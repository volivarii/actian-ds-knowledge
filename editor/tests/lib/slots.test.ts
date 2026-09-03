// Every `filled` test is asserted against a known-filled AND a known-empty
// REAL record. A test that only asserts the aggregate count passes when the
// tables are empty, which is the one failure mode a completeness model cannot
// afford: it would report a healthy substrate by measuring nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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
import {
  DOMAINS,
  type CoverageRow,
  type Domain,
} from "../../src/lib/coverageLoader";
import { domainFileName } from "../../src/lib/workspaceState";

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

/**
 * A Slot that is genuinely partial today must be neither never-true nor
 * always-true over the corpus.
 *
 * This replaces exact counts (14, 13, 29, 10, 3, 26, 22 …). Those asserted the
 * SHAPE OF THE CORPUS, not the correctness of the predicate, and
 * `editor-ci.yml` lists `app-context/src/**` in its paths filter — so an author
 * adding one `when:` clause, the exact action the Rule Slot's help tells them
 * to take, re-triggered this lane and turned it red on `14`. **A gate must not
 * fail on the improvement it exists to encourage.**
 *
 * The predicate itself is pinned by the known-filled / known-empty record
 * assertions above each of these; this only catches a degenerate one.
 */
function partial<R>(
  records: R[],
  slot: { key: string; filled: (r: R) => boolean },
): void {
  const n = records.filter((r) => slot.filled(r)).length;
  assert.ok(records.length > 0, `${slot.key}: empty corpus, check is vacuous`);
  assert.ok(n > 0, `${slot.key} is filled by NOTHING — the predicate is broken`);
  assert.ok(
    n < records.length,
    `${slot.key} is filled by EVERYTHING (${n}/${records.length}) — the predicate is broken`,
  );
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
  partial(rs, s);
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
  partial(rs, s);
});

test("Built from and Used in read the pattern's own lists", () => {
  const rs = records();
  partial(rs, slot("built_from"));
  // Used in is at total today. Asserting `=== 31` would break the day a pattern
  // is added without an app, which is a finding for the SCREEN, not a test
  // failure. What must hold is that the predicate reads the list.
  assert.equal(slot("used_in").filled(bySlug(rs, "asset-detail-360")), true);
  assert.equal(
    slot("used_in").filled({ ...bySlug(rs, "asset-detail-360"), apps: [] }),
    false,
  );
});

test("Job is a cross-file join: a Product's use case must name the pattern", () => {
  const rs = records();
  const s = slot("job");
  // search-filtered-table is named by a Studio use case; ai-analyst-panel
  // claims an app but no use case reaches it.
  assert.equal(s.filled(bySlug(rs, "search-filtered-table")), true);
  assert.equal(s.filled(bySlug(rs, "ai-analyst-panel")), false);
  partial(rs, s);
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
  assert.equal(s.filled(bySlug(rs, "activity-timeline")), false);
  partial(rs, s);

  // The join property, stated so it survives a fifth recipe: at least one
  // counted capture is a recipe whose OWN slug differs from the pattern's.
  // That is precisely what a filename join drops, and asserting
  // `captureCount === 2` instead would have broken the day someone captured
  // right-sliding-drawer a third time.
  const recipes = realRecipes();
  const crossNamed = recipes.filter(
    (r) => (r.patterns ?? []).some((name) => name !== r.slug),
  );
  assert.ok(
    crossNamed.length > 0,
    "no recipe names a pattern other than itself — the filename join would now pass, so this check is vacuous",
  );
  for (const r of crossNamed) {
    for (const name of r.patterns ?? []) {
      if (name === r.slug) continue;
      const row = rs.find((x) => x.slug === name);
      if (!row) continue;
      assert.ok(
        row.captureCount >= 1,
        `${name} is captured by ${r.slug}.json but counts ${row.captureCount} captures — the join is reading filenames`,
      );
    }
  }
});

test("Tags is filled by a non-empty tag list", () => {
  const rs = records();
  partial(rs, slot("tags"));
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

  partial(rs, s("properties"));
  partial(rs, s("link"));
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
  // Every Product Slot must be read by SOMETHING; a predicate filled by
  // nothing is broken. Exact counts are deliberately not asserted — three
  // products is a corpus fact, not a contract.
  for (const slotDef of PRODUCT_SLOTS) {
    assert.ok(
      rs.some((r) => slotDef.filled(r)),
      `${slotDef.key} is filled by no product — the predicate is broken`,
    );
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
  assert.ok(rs.length > 0, "no terms — vacuous");
  for (const s of TERM_SLOTS) {
    assert.ok(rs.every((r) => s.filled(r)), `${s.key} is no longer full`);
    assert.equal(
      s.filled({ slug: "synthetic", label: "Synthetic", meaning: "", notUse: [] }),
      false,
      `${s.key} returns true for an empty record`,
    );
  }
});

test("every Slot in every table takes its name from the vocabulary", () => {
  // COMPONENT_SLOTS was omitted here while the title said "every table" — the
  // one table built by MAPPING a list rather than written out, and so the one
  // where a missing word would ship as `name: undefined` and render a blank
  // label. That is the third time in two days a guard's subject has been
  // narrower than its name.
  for (const table of [
    PATTERN_SLOTS,
    ENTITY_SLOTS,
    PRODUCT_SLOTS,
    TERM_SLOTS,
    COMPONENT_SLOTS,
  ] as Array<Array<{ key: keyof typeof SLOT_LABEL; name: string }>>) {
    for (const s of table) {
      assert.equal(s.name, SLOT_LABEL[s.key], `${s.key} restates its own name`);
      assert.equal(typeof s.name, "string");
      assert.ok(s.name.length > 0, `${s.key} renders an empty label`);
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

test("a domain Slot's help names a component whose THAT domain is authored", () => {
  // The rule-5 guard proves a help NAMES a real record. It cannot prove what
  // the help SAYS about it is true, and three of these were false on first
  // writing — "drawer is the one with real focus management to copy" pointed at
  // a component whose behavior is INHERITED with no file, so an author
  // following the help found nothing. Naming an example whose guidance does not
  // exist is worse than naming none.
  //
  // This is the part that IS checkable: join the example against the file the
  // domain is actually authored in.
  const authored = (domain: Domain): string[] => {
    // Imported, not re-derived: a hand-copy of this mapping is the list the
    // repo's standing rule says to replace with the read.
    const file = domainFileName(domain);
    return authoredComponentSlugs().filter((slug) =>
      existsSync(join(REPO, "components", "src", slug, file)),
    );
  };
  const domainSlots = COMPONENT_SLOTS.filter((s) =>
    (DOMAINS as readonly string[]).includes(s.key),
  );
  assert.equal(domainSlots.length, DOMAINS.length, "domain Slots went missing");
  for (const slot of domainSlots as Array<{ key: Domain; help: string }>) {
    const withFile = authored(slot.key);
    assert.ok(
      withFile.length > 0,
      `no component authors ${slot.key} — the check is vacuous`,
    );
    assert.ok(
      withFile.some((slug) => namesRecord(slot.help, slug)),
      `${slot.key}'s help names no component that actually authors ${slot.key}. ` +
        `Authored by: ${withFile.join(", ")}. Help: "${slot.help}"`,
    );
  }
});
