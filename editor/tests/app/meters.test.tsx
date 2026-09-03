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
import type { Meter } from "../../src/lib/measure";
import { b64 } from "../helpers/fakeOctokit";
import { buildPatternIndex, type AppContextDoc, type RecipeDoc } from "../../src/lib/patternIndex";
import { measure } from "../../src/lib/measure";
import {
  PATTERN_SLOTS,
  COMPONENT_SLOTS,
  patternSlotRecords,
  componentSlotRecords,
  componentSlotsFor,
} from "../../src/lib/slots";
import { summarize, type CoverageRow } from "../../src/lib/coverageLoader";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

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
    action: "Write",
  },
  {
    key: "used_in",
    name: "Used in",
    filled: 31,
    total: 31,
    complete: true,
    measuredAt: "2026-09-03",
    help: "h",
    action: "Attach",
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
  const { container } = mount(<MeterList title="Pattern" meters={METERS} />);
  const text = container.textContent ?? "";
  assert.ok(text.includes("14 of 31"), `no pair in: ${text}`);
  assert.ok(!/\d+\s*%/.test(text), `a bare percentage reached the screen: ${text}`);
});

test("a Meter renders the date it was measured", () => {
  const { container } = mount(<MeterList title="Pattern" meters={METERS} />);
  assert.ok((container.textContent ?? "").includes("2026-09-03"));
});

test("a complete Meter is dimmed, not hidden", () => {
  const { container } = mount(<MeterList title="Pattern" meters={METERS} />);
  const text = container.textContent ?? "";
  assert.ok(text.includes("Used in"), "a full Meter was dropped from the list");
  assert.ok(text.includes("31 of 31"));
  const row = container.querySelector('[data-meter="used_in"]');
  assert.ok(row, "no row for the complete Meter");
  // Read the attribute on the element the styling keys off, not on an
  // ancestor: happy-dom does not inherit a parent's computed style, so an
  // assertion one level up passes whatever the rule actually targets.
  assert.equal(row.getAttribute("data-complete"), "true");
  const incomplete = container.querySelector('[data-meter="rule"]');
  assert.equal(incomplete?.getAttribute("data-complete"), "false");
});

test("an empty scope says 0 of 0 rather than reading as done", () => {
  const { container } = mount(
    <MeterList
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
  const { PatternsDashboard } = await import("../../src/app/PatternsDashboard");
  const { container } = mount(
    <PatternsDashboard
      octokit={fakeGhServingRealAppContext()}
      onOpenFile={() => {}}
    />,
  );
  await waitFor(() => {
    assert.ok((container.textContent ?? "").includes("14 of 31"));
  });
  const text = container.textContent ?? "";
  assert.ok(text.includes("26 of 30"), "Entity Properties meter missing");
  assert.ok(text.includes("2 of 3"), "Product Navigation meter missing");
  assert.ok(text.includes("33 of 33"), "Term meters missing");
  // The prose figures are derived from the same meters, so they must appear
  // with the values the corpus has. Rule is 14 of 31, so 17 have no when
  // clause; Job is 10; Capture is 3.
  assert.ok(text.includes("17 with no when clause"), `prose noWhen wrong in: ${text.slice(0, 600)}`);
  assert.ok(text.includes("naming 10 of them"), "prose namedByAUseCase wrong");
  assert.ok(text.includes("on 3 patterns"), "prose withCapture wrong");
  assert.ok(!/\d+\s*%/.test(text), `a bare percentage reached the dashboard: ${text}`);
});

test("the dashboard prose and the Pattern meters cannot drift apart", () => {
  // The dashboard used to count "no when clause", "named by a use case" and
  // "patterns with a capture" itself, beside the Slot tables counting the same
  // three things. Two derivations of one number is precisely what the Slot
  // model exists to remove, so the prose now reads the Meters — and this
  // asserts the join rather than trusting the refactor.
  const doc = JSON.parse(
    readFileSync(join(REPO, "app-context", "dist", "app-context.json"), "utf8"),
  ) as AppContextDoc;
  const recipeDir = join(REPO, "app-context", "dist", "recipes");
  const recipes: RecipeDoc[] = readdirSync(recipeDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(recipeDir, f), "utf8")) as RecipeDoc);
  const index = buildPatternIndex(doc, recipes);
  const meters = measure(patternSlotRecords(index), PATTERN_SLOTS, "2026-09-03");
  const m = (key: string) => {
    const found = meters.find((x) => x.key === key);
    assert.ok(found, `no meter ${key}`);
    return found;
  };
  const rule = m("rule");

  const src = readFileSync(
    join(REPO, "editor", "src", "app", "PatternsDashboard.tsx"),
    "utf8",
  );
  // The three figures must be DERIVED from a meter in the source, not counted
  // again. Checking the rendered number alone would pass on a coincidence.
  assert.ok(
    src.includes("withCapture: meterFor(\"capture\").filled"),
    "withCapture no longer reads the Capture meter",
  );
  assert.ok(
    src.includes("namedByAUseCase: meterFor(\"job\").filled"),
    "namedByAUseCase no longer reads the Job meter",
  );
  assert.ok(
    src.includes("noWhen: rule.total - rule.filled"),
    "noWhen no longer reads the Rule meter",
  );
  // And the values they produce are the ones the corpus actually has.
  assert.equal(rule.total - rule.filled, 17);
  assert.equal(m("job").filled, 10);
  assert.equal(m("capture").filled, 3);
});
