// The numbers have to reach the screen.
//
// A component test proves the component works, never that anything renders it.
// So this file does both: it asserts MeterList's rendering contract, and then
// mounts the real PatternsDashboard against the real corpus to prove a screen
// actually calls it. Shipping into a surface that does not render happened
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

test("the patterns dashboard renders the meters from the real corpus", async () => {
  // Not a MeterList test: this proves something RENDERS one. A passing
  // component test says nothing about whether any screen calls it.
  const { container } = mount(
    <PatternsDashboard
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
  assert.ok(text.includes("26 of 30"), "Entity Properties meter missing");
  assert.ok(text.includes("2 of 3"), "Product Navigation meter missing");
  assert.ok(text.includes("33 of 33"), "Term meters missing");
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
  // The prose figures are derived from the same meters, so they must appear
  // with the values the corpus has. Rule is 14 of 31, so 17 have no when
  // clause; Job is 10; Capture is 3.
  assert.ok(text.includes("17 with no when clause"), `prose noWhen wrong in: ${text.slice(0, 600)}`);
  assert.ok(text.includes("naming 10 of them"), "prose namedByAUseCase wrong");
  assert.ok(text.includes("on 3 patterns"), "prose withCapture wrong");
  assert.ok(!/\d+\s*%/.test(text), `a bare percentage reached the dashboard: ${text}`);
});

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

test("the dashboard prose is DERIVED from the meters, not counted again", async () => {
  // The dashboard used to count "no when clause", "named by a use case" and
  // "patterns with a capture" itself, beside the Slot tables counting the same
  // three things.
  //
  // An earlier version of this test asserted SOURCE SUBSTRINGS of
  // PatternsDashboard.tsx, which broke on any reformat and never actually
  // asserted the join. This drives the screen with a fixture whose numbers
  // differ from the real corpus, so a figure counted a second time — or
  // hard-coded — produces the real corpus's number and fails here.
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
  const m = (key: string) => {
    const found = meters.find((x) => x.key === key);
    assert.ok(found, `no meter ${key}`);
    return found;
  };
  // The fixture deliberately differs from the real corpus (17 / 10 / 3).
  const rule = m("rule");
  assert.equal(rule.total - rule.filled, 2);
  assert.equal(m("job").filled, 1);
  assert.equal(m("capture").filled, 0);

  const { container } = mount(<PatternsDashboardHarness doc={doc} />);
  await waitFor(() => {
    assert.ok((container.textContent ?? "").includes("with no when clause"));
  });
  const text = container.textContent ?? "";
  assert.ok(text.includes("2 with no when clause"), `prose noWhen wrong in: ${text.slice(0, 500)}`);
  assert.ok(text.includes("naming 1 of them"), "prose namedByAUseCase wrong");
  assert.ok(text.includes("on 0 patterns"), "prose withCapture wrong");
  // ...and the real corpus's figures must NOT appear, which is what a
  // hard-coded or separately-counted figure would produce.
  assert.ok(!text.includes("17 with no when clause"), "noWhen is not derived");
  assert.ok(!text.includes("naming 10 of them"), "namedByAUseCase is not derived");
});

