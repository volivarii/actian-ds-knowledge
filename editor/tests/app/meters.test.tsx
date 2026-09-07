// The numbers have to reach the screen.
//
// A component test proves the component works, never that anything renders it.
// So this file does both: it asserts MeterList's rendering contract, and then
// mounts the real GraphHealthTab against the real corpus to prove a screen
// actually calls it. The meters moved there from the patterns dashboard, so
// this file follows them: mounting the component they left behind would prove
// the opposite of what the file is for. Shipping into a surface that does not render happened
// twice in one day on this codebase.
import "../setup-happy-dom";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { Theme } from "@radix-ui/themes";
import { MeterList } from "../../src/app/MeterList";
import { PatternsDashboard } from "../../src/app/PatternsDashboard";
import { GraphHealthTab } from "../../src/app/GraphHealthTab";
import type { Meter } from "../../src/lib/measure";
import { b64 } from "../helpers/fakeOctokit";
import { buildPatternIndex, type AppContextDoc, type RecipeDoc } from "../../src/lib/patternIndex";
import { measure } from "../../src/lib/measure";
import {
  PATTERN_SLOTS,
  ENTITY_SLOTS,
  PRODUCT_SLOTS,
  TERM_SLOTS,
  patternSlotRecords,
  entitySlotRecords,
  productSlotRecords,
  termSlotRecords,
} from "../../src/lib/slots";

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

// happy-dom doesn't install sessionStorage; provide a minimal in-memory stub.
if (!globalThis.sessionStorage) {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    },
  });
}

const METERS: Meter[] = [
  {
    key: "rule",
    name: "Rule",
    filled: 14,
    total: 31,
    complete: false,
    measuredAt: "2026-09-03",
    help: "h",
  },
  {
    key: "part_of",
    name: "Part of",
    filled: 31,
    total: 31,
    complete: true,
    measuredAt: "2026-09-03",
    help: "h",
  },
];

// Teardown as afterEach, not as each test's last statement: a trailing
// cleanup() is skipped when an assertion throws, which leaks the mount and
// turns the next failure into a 30s SIGKILL that reads as a hang rather than
// as the assertion that actually failed.
afterEach(() => cleanup());

function mount(ui: React.ReactElement) {
  return render(<Theme>{ui}</Theme>);
}

test("a Meter renders the pair, never a bare percentage", () => {
  const { container } = mount(<MeterList groupKey="pattern" title="Pattern" meters={METERS} />);
  const text = container.textContent ?? "";
  assert.ok(text.includes("14 of 31"), `no pair in: ${text}`);
  assert.ok(!/\d+\s*%/.test(text), `a bare percentage reached the screen: ${text}`);
});

test("a Meter renders the date it was measured", () => {
  const { container } = mount(<MeterList groupKey="pattern" title="Pattern" meters={METERS} />);
  assert.ok((container.textContent ?? "").includes("2026-09-03"));
});

test("showDate=false drops the stamp, for a caller that states it once", () => {
  const { container } = mount(
    <MeterList groupKey="pattern" title="Pattern" meters={METERS} showDate={false} />,
  );
  const text = container.textContent ?? "";
  assert.ok(!text.includes("2026-09-03"), "the per-group stamp is still there");
  // The measurement itself is untouched — only this group's stamp is hidden.
  assert.ok(text.includes("14 of 31"));
});

test("a complete Meter is dimmed, not hidden", () => {
  const { container } = mount(<MeterList groupKey="pattern" title="Pattern" meters={METERS} />);
  const text = container.textContent ?? "";
  assert.ok(text.includes("Part of"), "a full Meter was dropped from the list");
  assert.ok(text.includes("31 of 31"));
  const row = container.querySelector('[data-meter="pattern:part_of"]');
  assert.ok(row, "no row for the complete Meter");
  assert.equal(row.getAttribute("data-complete"), "true");
  const incomplete = container.querySelector('[data-meter="pattern:rule"]');
  assert.equal(incomplete?.getAttribute("data-complete"), "false");

  // The attribute alone proves nothing about DIMMING. While the dimming was an
  // inline opacity, deleting it left complete Meters looking identical to
  // incomplete ones and this test stayed green — a gate that cannot fail on the
  // thing it names. The row carries the class the rule is written against...
  assert.ok(
    row.classList.contains("meter-row"),
    "the row does not carry the class the dimming rule targets",
  );
  // ...and the rule exists in the stylesheet the app loads. Asserting the JOIN,
  // because the test environment does not load base.css and a computed style
  // here would read the default either way.
  const css = readFileSync(
    join(REPO, "editor", "src", "styles", "base.css"),
    "utf8",
  );
  assert.ok(
    /\.meter-row\[data-complete="true"\]\s*\{[^}]*color:/.test(css),
    "base.css has no rule dimming a complete meter row",
  );
});

test("a Meter group title is a heading below the page heading, not an h1", () => {
  // Radix `Heading` defaults `as` to h1. Four groups on the patterns dashboard
  // rendered four page-level h1s under the page's h3, which a screen reader's
  // heading list presents as four pages.
  //
  // h4 was right while both consumers were tab panels nested under home's h1.
  // They are screens now, each with its own h1, so h4 skipped two levels and
  // the group title moved to h2. What must never change is that it is not an
  // h1: the page owns that.
  const { container } = mount(
    <MeterList groupKey="g" title="Pattern" meters={METERS} />,
  );
  assert.ok(container.querySelector("h2"), "the group title should be an h2");
  assert.equal(
    container.querySelector("h1") === null,
    true,
    "the group title rendered as a page-level h1",
  );
});

test("an empty scope says 0 of 0 rather than reading as done", () => {
  const { container } = mount(
    <MeterList
      groupKey="pattern"
      title="Pattern"
      meters={[{ ...METERS[0]!, filled: 0, total: 0, complete: false }]}
    />,
  );
  assert.ok((container.textContent ?? "").includes("0 of 0"));
});

// ---------------------------------------------------------------- the screen

/** Serves the real app-context corpus, including the recipes DIRECTORY
 *  listing that `listFilesByGlob` needs. */
function fakeGhServingRealAppContext() {
  const recipeDir = join(REPO, "app-context", "dist", "recipes");
  const recipeFiles = readdirSync(recipeDir).filter((f) => f.endsWith(".json"));
  const files: Record<string, string> = {
    "app-context/dist/app-context.json": readFileSync(
      join(REPO, "app-context", "dist", "app-context.json"),
      "utf8",
    ),
  };
  for (const f of recipeFiles) {
    files[`app-context/dist/recipes/${f}`] = readFileSync(
      join(recipeDir, f),
      "utf8",
    );
  }
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "app-context/dist/recipes") {
          return {
            data: recipeFiles.map((name) => ({ name, type: "file" })),
          };
        }
        if (!(path in files)) {
          const e = new Error("not found") as Error & { status: number };
          e.status = 404;
          throw e;
        }
        return {
          data: { encoding: "base64", content: b64(files[path]!), sha: `sha-${path}` },
        };
      },
      listCommits: async () => ({ data: [] }),
    },
    git: {},
    pulls: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("the health screen renders the meters from the real corpus", async () => {
  // Not a MeterList test, and not an AppContextMeters test either: this proves
  // a SCREEN renders one. A passing component test says nothing about whether
  // anything calls it, which is why this mounts the screen at `#/health`.
  const { container } = mount(
    <GraphHealthTab
      octokit={fakeGhServingRealAppContext()}
      onOpenFile={() => {}}
    />,
  );
  const index = buildPatternIndex(realDoc(), realRecipes());
  const at = "2026-01-01";
  const expected = {
    pattern: measure(patternSlotRecords(index), PATTERN_SLOTS, at),
    entity: measure(entitySlotRecords(index.doc), ENTITY_SLOTS, at),
    product: measure(productSlotRecords(index.doc), PRODUCT_SLOTS, at),
    term: measure(termSlotRecords(index.doc), TERM_SLOTS, at),
  };
  const ruleMeter = expected.pattern.find((x) => x.key === "rule")!;
  await waitFor(() => {
    assert.ok(
      (container.textContent ?? "").includes(
        `${ruleMeter.filled} of ${ruleMeter.total}`,
      ),
    );
  });
  const text = container.textContent ?? "";

  // Every Meter, DERIVED from the corpus and matched on its own ROW, never with
  // `text.includes` over the whole screen. Two failures made this necessary:
  // the figures were pinned ("26 of 30", "2 of 3", "33 of 33"), so an author
  // giving Explorer a sidebar turned the lane red on the improvement; and
  // `"22 of 30".includes("2 of 3")` is TRUE, so the only Product-specific
  // assertion in this file was satisfied by the Entity Link meter and could not
  // fail on its subject — deleting the whole Product MeterList left it green.
  for (const [group, meters] of [
    ["pattern", expected.pattern],
    ["entity", expected.entity],
    ["product", expected.product],
    ["term", expected.term],
  ] as const) {
    for (const meter of meters) {
      const row = container.querySelector(
        `[data-meter="${group}:${meter.key}"]`,
      );
      assert.ok(row, `no row rendered for ${group}:${meter.key}`);
      assert.equal(
        (row.textContent ?? "").includes(`${meter.filled} of ${meter.total}`),
        true,
        `${group}:${meter.key} should read "${meter.filled} of ${meter.total}", got "${row.textContent}"`,
      );
    }
  }
  // Rule 2 is satisfied once for the row, not four times: looking at it, four
  // identical stamps read as four measurements that happen to agree.
  // Built the same way the screen builds it. Using `toISOString()` here — the
  // UTC form the screen deliberately does NOT use — made this test fail for
  // any contributor whose local date differs from UTC.
  const today = new Date().toLocaleDateString("en-CA");
  assert.equal(
    text.split(`measured ${today}`).length - 1,
    1,
    "the measurement date must appear exactly once for the row",
  );
  // Rule 1, scoped to the Meter rows. Not to the whole screen: `#/health` has
  // carried a Coverage-by-kind badge strip in percent since before the meters
  // arrived, so a screen-wide assertion would fail on a rule the meters do not
  // own and cannot fix.
  const meterText = [...container.querySelectorAll(".meter-row")]
    .map((r) => r.textContent ?? "")
    .join(" ");
  assert.ok(meterText.length > 0, "no meter rows to check for percentages");
  assert.ok(
    !/\d+\s*%/.test(meterText),
    `a bare percentage reached a Meter row: ${meterText}`,
  );
});

test("an unreadable captures directory hides the Meter, it does not blank the app", async () => {
  // This path had NO test, and it crashed. `patternSlotsFor` drops the Capture
  // Slot when the captures cannot be read, and the summary looked it up with a
  // helper that THROWS when a Meter is missing — inside useMemo, during render.
  // There is no ErrorBoundary in the editor, so React 18 unmounted the whole
  // root: a 403 on the recipes directory blanked the entire app rather than
  // hiding one Meter. The degraded path the branch added a note for was the
  // path that crashed.
  const doc = realDoc();
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "app-context/dist/recipes") {
          const e = new Error("forbidden") as Error & { status: number };
          e.status = 403;
          throw e;
        }
        if (path === "app-context/dist/app-context.json") {
          return {
            data: {
              encoding: "base64",
              content: b64(JSON.stringify(doc)),
              sha: "sha",
            },
          };
        }
        const e = new Error("not found") as Error & { status: number };
        e.status = 404;
        throw e;
      },
      listCommits: async () => ({ data: [] }),
    },
    git: {},
    pulls: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const { container } = mount(
    <GraphHealthTab octokit={gh} onOpenFile={() => {}} />,
  );
  await waitFor(() => {
    assert.ok(container.querySelector('[data-meter="pattern:rule"]'));
  });
  const text = container.textContent ?? "";
  // The app is still there...
  assert.ok(text.length > 200, "the health screen rendered empty");
  assert.ok(container.querySelector('[data-meter="pattern:job"]'));
  // ...the Capture Meter is gone rather than reporting a zero...
  assert.equal(
    container.querySelector('[data-meter="pattern:capture"]') === null,
    true,
  );
  // ...the reader is told why...
  assert.ok(text.includes("not measured"), "nothing said about the missing Meter");
  // The rest of what this test used to assert lived on the patterns TABLE: a
  // "?" cell naming its own reason, and the absence of a dash claiming "no
  // capture". The catalogue has no Captures column any more, so those moved to
  // the test below, which mounts the screen that would carry them.
});

test("an unreadable captures directory makes the CATALOGUE withhold too", async () => {
  // The screen must not state in a table what it declined to state above it.
  // The old Captures column drew a dash on all 31 rows when nothing had been
  // read, which is an authored claim ("this pattern has no capture") standing
  // in for a measurement that never happened. The column is gone, so the way
  // that regression returns is a row rendering an empty capture affordance
  // instead of the page saying, once, that the read failed.
  const doc = realDoc();
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "app-context/dist/recipes") {
          const e = new Error("forbidden") as Error & { status: number };
          e.status = 403;
          throw e;
        }
        if (path === "app-context/dist/app-context.json") {
          return {
            data: { encoding: "base64", content: b64(JSON.stringify(doc)), sha: "sha" },
          };
        }
        const e = new Error("not found") as Error & { status: number };
        e.status = 404;
        throw e;
      },
      listCommits: async () => ({ data: [] }),
    },
    git: {},
    pulls: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const { container } = mount(
    <PatternsDashboard octokit={gh} onOpenFile={() => {}} />,
  );
  await waitFor(() => {
    assert.ok(container.querySelector("table"));
  });
  const text = container.textContent ?? "";
  // Said once, and said as the reason rather than as a symbol.
  assert.ok(
    text.includes("could not be read completely"),
    `the catalogue did not say the captures were unreadable: ${text.slice(0, 400)}`,
  );
  // No cell stands in for the measurement that never happened. `0` is NOT in
  // this list: the Components column reports a real zero for a pattern that
  // composes nothing, and counting that as a stand-in made this assertion fail
  // on a true measurement about a different subject.
  const standIns = [...container.querySelectorAll("td, th")].filter((c) =>
    ["\u2014", "-", "?"].includes((c.textContent ?? "").trim()),
  );
  assert.equal(
    standIns.length,
    0,
    `${standIns.length} cells claim a capture answer while the captures could not be read`,
  );
  // And positively: no capture affordance at all. A chip is the only thing on
  // a row that asserts a capture, so an empty list of them is the postcondition
  // this test is actually about.
  const chips = [...container.querySelectorAll('[role="button"]')].filter(
    (el) => (el.getAttribute("title") ?? "").length > 0,
  );
  assert.equal(
    chips.length,
    0,
    `${chips.length} capture chips rendered from a directory that would not list`,
  );
  // And a cell never names itself with `aria-label` on a span: ARIA 1.2
  // prohibits naming a generic element, so assistive technology drops it.
  assert.equal(
    container.querySelector("td span[aria-label]") === null,
    true,
    "a table cell still names itself with aria-label on a span",
  );
});

test("a PARTIAL capture read keeps the chips that loaded", async () => {
  // The degraded-path test above 403s the whole DIRECTORY, so every row has
  // zero recipes and a blanket `!recipesReadable ? "?"` behaves identically.
  // The case that distinguishes them is one BAD FILE among good ones: the read
  // is incomplete, so the Meter is rightly withheld, but the captures that DID
  // load must still be reachable. A blanket check erased them and made
  // RecipePanel unreachable for patterns whose recipes were fine.
  const doc = realDoc();
  const recipes = realRecipes();
  const good = recipes.find((r) => (r.patterns ?? []).length > 0)!;
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "app-context/dist/recipes") {
          return {
            data: [
              { name: `${good.slug}.json`, type: "file" },
              { name: "broken.json", type: "file" },
            ],
          };
        }
        if (path === "app-context/dist/recipes/broken.json") {
          const e = new Error("throttled") as Error & { status: number };
          e.status = 429;
          throw e;
        }
        if (path === `app-context/dist/recipes/${good.slug}.json`) {
          return {
            data: {
              encoding: "base64",
              content: b64(JSON.stringify(good)),
              sha: "sha",
            },
          };
        }
        if (path === "app-context/dist/app-context.json") {
          return {
            data: {
              encoding: "base64",
              content: b64(JSON.stringify(doc)),
              sha: "sha",
            },
          };
        }
        const e = new Error("not found") as Error & { status: number };
        e.status = 404;
        throw e;
      },
      listCommits: async () => ({ data: [] }),
    },
    git: {},
    pulls: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const { container } = mount(
    <PatternsDashboard octokit={gh} onOpenFile={() => {}} />,
  );
  await waitFor(() => {
    assert.ok(container.querySelector("table"));
  });
  const text = container.textContent ?? "";
  // The Meter this used to check moved to `#/health` with the rest of them, and
  // the test above owns it there. What the CATALOGUE still owes a reader is the
  // reason, said once above the table rather than in a cell on all 31 rows.
  assert.ok(
    text.includes("could not be read completely"),
    `the catalogue did not say the captures were unreadable: ${text.slice(0, 300)}`,
  );
  // ...but the capture that loaded is still REACHABLE. Asserting on the chip,
  // not on the slug: the pattern's slug appears in the Pattern column whether
  // or not its capture survived, so an earlier version of this assertion passed
  // under the very regression it was written for.
  const chips = [...container.querySelectorAll('[role="button"]')].filter(
    (el) => (el.getAttribute("title") ?? "").length > 0,
  );
  assert.ok(
    chips.length > 0,
    `the capture that loaded was erased: no capture chip rendered. ${text.slice(0, 300)}`,
  );
});

// REMOVED: "the prose counts DISTINCT captured recipes, not pattern-recipe
// pairs". Its subject was the patterns dashboard's summary sentence, which
// counted distinct recipe FILES. That sentence is gone: the catalogue shows a
// capture as a chip on the pattern it belongs to, and the Capture Meter on
// `#/health` counts PATTERNS with a capture, which is the question a reader
// asks. No surface states a recipe-file count any more, so there is no
// derivation left for a test to protect.

/** Mounts the real dashboard against an arbitrary in-memory app-context. */
function PatternsDashboardHarness({ doc }: { doc: AppContextDoc }) {
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "app-context/dist/recipes") return { data: [] };
        if (path === "app-context/dist/app-context.json") {
          return {
            data: {
              encoding: "base64",
              content: b64(JSON.stringify(doc)),
              sha: "sha",
            },
          };
        }
        const e = new Error("not found") as Error & { status: number };
        e.status = 404;
        throw e;
      },
      listCommits: async () => ({ data: [] }),
    },
    git: {},
    pulls: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return <PatternsDashboard octokit={gh} onOpenFile={() => {}} />;
}

test("the catalogue's when-clause count is the Rule Meter, not a second count", async () => {
  // The dashboard used to count "no when clause", "named by a use case" and
  // "patterns with a capture" itself, beside the Slot tables counting the same
  // three things. Two of those three readings are gone with the prose. The one
  // that survives is the catalogue's filter label, "Missing a when clause (N)",
  // and it now sits on a DIFFERENT SCREEN from the Rule Meter that measures the
  // same fact, which is exactly when two derivations drift unnoticed.
  //
  // An earlier version of this test asserted SOURCE SUBSTRINGS of
  // PatternsDashboard.tsx, which broke on any reformat and never asserted the
  // join. This drives the screen with a fixture whose numbers differ from the
  // real corpus, so a figure counted a second time, or hard-coded, produces the
  // real corpus's number and fails here.
  const doc: AppContextDoc = {
    apps: {
      studio: {
        label: "Studio",
        sidebar: [{ label: "Catalog", id: "catalog" }],
        useCases: [
          { audience: ["Steward"], jobs: ["Govern"], patterns: ["alpha"] },
        ],
      },
    },
    patterns: {
      alpha: {
        label: "Alpha",
        apps: ["studio"],
        tags: ["a"],
        when: "Use for alpha.",
        components: ["button"],
        description: "Alpha.",
      },
      beta: {
        label: "Beta",
        apps: ["studio"],
        tags: ["b"],
        components: ["button"],
        description: "Beta.",
      },
      gamma: {
        label: "Gamma",
        apps: ["studio"],
        tags: ["c"],
        components: ["button"],
        description: "Gamma.",
      },
    },
    entities: {},
    terminology: {},
  };
  const index = buildPatternIndex(doc, []);
  const meters = measure(patternSlotRecords(index), PATTERN_SLOTS, "2026-09-03");
  const rule = meters.find((x) => x.key === "rule");
  assert.ok(rule, "no rule meter");
  // The fixture deliberately differs from the real corpus.
  assert.equal(rule.total - rule.filled, 2);

  const { container } = mount(<PatternsDashboardHarness doc={doc} />);
  await waitFor(() => {
    assert.ok((container.textContent ?? "").includes("Missing a when clause"));
  });
  const text = container.textContent ?? "";
  assert.ok(
    text.includes(`Missing a when clause (${rule.total - rule.filled})`),
    `the filter label is not the Rule Meter's shortfall: ${text.slice(0, 500)}`,
  );

  // ...and the REAL corpus's figure must not appear, which is what a hard-coded
  // or separately-counted figure would produce. Derived from the real corpus
  // rather than written as a literal, so this stays correct as the corpus moves.
  const realIdx = buildPatternIndex(realDoc(), realRecipes());
  const realMeters = measure(
    patternSlotRecords(realIdx),
    PATTERN_SLOTS,
    "2026-01-01",
  );
  const realRule = realMeters.find((x) => x.key === "rule");
  assert.ok(realRule, "no rule meter for the real corpus");
  assert.notEqual(
    realRule.total - realRule.filled,
    rule.total - rule.filled,
    "fixture and real corpus agree on noWhen, so this test can no longer tell derived from hard-coded",
  );
  assert.ok(
    !text.includes(`Missing a when clause (${realRule.total - realRule.filled})`),
    "the when-clause count is not derived",
  );
});


test("a Slot's help is reachable without a mouse", () => {
  // `Slot.help` is the only place a Slot's meaning and its worked example are
  // written. Behind a hover-only Tooltip on a plain span, a keyboard or
  // screen-reader user read "Rule 14 of 31" with no way to learn what Rule is.
  const { container } = mount(
    <MeterList groupKey="pattern" title="Pattern" meters={METERS} />,
  );
  const row = container.querySelector('[data-meter="pattern:rule"]');
  assert.ok(row);
  const name = row.querySelector("[aria-describedby]");
  assert.ok(name, "the Slot name carries no accessible description");
  assert.equal(name.getAttribute("tabindex"), "0", "the name is not focusable");
  const describedBy = name.getAttribute("aria-describedby")!;
  const help = container.querySelector(`#${describedBy}`);
  assert.ok(help, `aria-describedby points at #${describedBy}, which is absent`);
  assert.equal((help.textContent ?? "").trim(), METERS[0]!.help);
});
