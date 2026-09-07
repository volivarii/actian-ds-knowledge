// The application-context block on `#/health`: four Meter groups and the
// integrity callouts for joins that do not resolve.
//
// This block used to open `#/patterns`, and these tests came with it. They
// mount GraphHealthTab rather than AppContextMeters, because the thing worth
// asserting after a move is that a SCREEN renders it. A component test would
// have passed just as well on the day the block was orphaned.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { GraphHealthTab } from "../../src/app/GraphHealthTab";

afterEach(() => cleanup());

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

/** Studio names a pattern that does not exist, and records a sidebar. Explorer
 *  records none, which is the case the Navigation Meter has to see. */
const APP_CONTEXT = {
  apps: {
    studio: {
      label: "Studio",
      sidebar: [{ label: "Catalog", id: "catalog" }],
      useCases: [
        {
          audience: ["Data steward"],
          jobs: ["Govern the catalog"],
          patterns: ["asset-detail-360", "ghost-pattern"],
        },
      ],
    },
    explorer: { label: "Explorer", sidebar: [], useCases: [] },
  },
  patterns: {
    "asset-detail-360": {
      label: "Asset detail 360",
      apps: ["studio"],
      when: "Use for a single asset.",
      components: ["tabs"],
    },
  },
  entities: {},
  terminology: {},
};

function ghServing(doc: unknown, recipes: Record<string, unknown> = {}) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "app-context/dist/recipes") {
          return {
            data: Object.keys(recipes).map((s) => ({
              name: `${s}.json`,
              type: "file",
            })),
          };
        }
        if (path === "app-context/dist/app-context.json") {
          return {
            data: { content: b64(JSON.stringify(doc)), encoding: "base64" },
          };
        }
        const m = path.match(/^app-context\/dist\/recipes\/(.+)\.json$/);
        const recipe = m?.[1] ? recipes[m[1]] : undefined;
        if (recipe) {
          return {
            data: { content: b64(JSON.stringify(recipe)), encoding: "base64" },
          };
        }
        const err = new Error("not found") as Error & { status: number };
        err.status = 404;
        throw err;
      },
      listCommits: async () => ({ data: [] }),
    },
    git: {},
    pulls: {},
  } as never;
}

test("the health screen renders the application-context meters", async () => {
  const { container } = render(
    wrap(<GraphHealthTab octokit={ghServing(APP_CONTEXT)} onOpenFile={() => {}} />),
  );
  await waitFor(() =>
    assert.ok(container.querySelector('[data-meter="pattern:rule"]')),
  );
  // All four groups, because the point of moving them was that they measure
  // four subjects and only one of them was patterns.
  for (const key of [
    "pattern:rule",
    "entity:properties",
    "product:navigation",
    "term:meaning",
  ]) {
    assert.ok(
      container.querySelector(`[data-meter="${key}"]`),
      `no meter row for ${key}`,
    );
  }
});

test("a use case naming a pattern that does not exist says so", async () => {
  // This callout was rendered inside each use case block on the old patterns
  // page. `AppUseCase.missingPatterns` kept being produced after those blocks
  // went, with nothing left reading it, so the signal was live in the index and
  // invisible on every screen.
  render(
    wrap(<GraphHealthTab octokit={ghServing(APP_CONTEXT)} onOpenFile={() => {}} />),
  );
  await waitFor(() => screen.getByText(/ghost-pattern/));
  assert.ok(
    screen.getByText(
      /use case.*name.*pattern that does not exist.*Studio.*Govern the catalog.*ghost-pattern/,
    ),
  );
});

test("a capture naming a missing pattern is called out by name", async () => {
  const recipes = {
    "partly-wrong": {
      slug: "partly-wrong",
      apps: ["studio"],
      patterns: ["asset-detail-360", "typo-browse"],
      derivedFrom: { surface: "Studio > Catalog", capturedOn: "2026-08-21" },
    },
  };
  render(
    wrap(
      <GraphHealthTab
        octokit={ghServing(APP_CONTEXT, recipes)}
        onOpenFile={() => {}}
      />,
    ),
  );
  // Reported per NAME, not per recipe: this capture resolves through one real
  // pattern, so reporting only fully-unresolved captures would drop the typo.
  await waitFor(() => screen.getByText(/partly-wrong names typo-browse/));
});

test("a product with no recorded navigation is measured, not silently zero", async () => {
  // The old patterns page flagged this with a per-app "no sidebar recorded"
  // badge. The badge went with the app blocks; the fact did not, because
  // PRODUCT_SLOTS already measures it. Explorer records no sidebar, so the
  // Navigation Meter reads one of two.
  const { container } = render(
    wrap(<GraphHealthTab octokit={ghServing(APP_CONTEXT)} onOpenFile={() => {}} />),
  );
  const row = await waitFor(() => {
    const el = container.querySelector('[data-meter="product:navigation"]');
    assert.ok(el);
    return el;
  });
  assert.match(row.textContent ?? "", /1 of 2/);
});

test("a clean context renders no integrity callout at all", async () => {
  // A diagnostics block that always shows something teaches a reader to skip
  // it. Proves these callouts CAN be absent, which is the half a fixture full
  // of defects never exercises.
  const clean = {
    apps: {
      studio: {
        label: "Studio",
        sidebar: [{ label: "Catalog", id: "catalog" }],
        useCases: [
          {
            audience: ["Data steward"],
            jobs: ["Govern the catalog"],
            patterns: ["asset-detail-360"],
          },
        ],
      },
    },
    patterns: APP_CONTEXT.patterns,
    entities: {},
    terminology: {},
  };
  const { container } = render(
    wrap(<GraphHealthTab octokit={ghServing(clean)} onOpenFile={() => {}} />),
  );
  await waitFor(() =>
    assert.ok(container.querySelector('[data-meter="pattern:rule"]')),
  );
  const text = container.textContent ?? "";
  assert.ok(!/does not exist/.test(text), "an integrity callout fired on a clean context");
  assert.ok(!/declare no pattern/.test(text));
  assert.ok(!/claim a product the context does not define/.test(text));
});
