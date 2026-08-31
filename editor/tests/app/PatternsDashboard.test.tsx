import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { PatternsDashboard } from "../../src/app/PatternsDashboard";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";
import { isPlainMarkdown } from "../../src/app/EditorShell";

afterEach(() => cleanup());

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

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
    "right-sliding-drawer": {
      label: "Right sliding drawer",
      apps: ["studio", "explorer"],
      when: "Use for a peek that leaves the page live.",
      components: ["drawer"],
    },
  },
};

const RECIPES: Record<string, unknown> = {
  "studio-quick-edit-drawer": {
    slug: "studio-quick-edit-drawer",
    apps: ["studio"],
    patterns: ["right-sliding-drawer"],
    derivedFrom: { surface: "Studio > Catalog", capturedOn: "2026-08-20" },
  },
};

function fakeGh() {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "app-context/dist/recipes") {
          return {
            data: Object.keys(RECIPES).map((s) => ({
              name: `${s}.json`,
              type: "file",
            })),
          };
        }
        if (path === "app-context/dist/app-context.json") {
          return {
            data: {
              content: b64(JSON.stringify(APP_CONTEXT)),
              encoding: "base64",
            },
          };
        }
        const m = path.match(/^app-context\/dist\/recipes\/(.+)\.json$/);
        const recipe = m?.[1] ? RECIPES[m[1]] : undefined;
        if (recipe) {
          return {
            data: { content: b64(JSON.stringify(recipe)), encoding: "base64" },
          };
        }
        const err = new Error("not found") as Error & { status: number };
        err.status = 404;
        throw err;
      },
    },
  } as never;
}

test("renders a section per app, with its use case job and audience", async () => {
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  assert.ok(screen.getByText("Explorer"));
  assert.ok(screen.getByText("Govern the catalog"));
  assert.ok(screen.getByText("Data steward"));
});

test("lists what an app claims but no use case names, per app", async () => {
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  assert.ok(screen.getByText("Claimed by Studio, named by no use case"));
  assert.ok(screen.getByText("Claimed by Explorer, named by no use case"));
  // The drawer claims both apps, so it appears under both.
  assert.equal(screen.getAllByText("Right sliding drawer").length, 2);
});

test("a use case naming a pattern that does not exist says so in the view", async () => {
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  assert.ok(
    screen.getByText(/Names 1 pattern that do(es)? not exist: ghost-pattern/),
  );
});

test("an app with no recorded sidebar is flagged rather than shown as zero", async () => {
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  assert.ok(screen.getByText("no sidebar recorded"));
  assert.ok(screen.getByText("1 sidebar entries"));
});

test("clicking a pattern opens its source markdown", async () => {
  const opened: string[] = [];
  render(
    wrap(
      <PatternsDashboard
        octokit={fakeGh()}
        onOpenFile={(p) => opened.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Asset detail 360"));
  fireEvent.click(screen.getByText("Asset detail 360"));
  assert.deepEqual(opened, ["app-context/src/patterns/asset-detail-360.md"]);
});

test("a capture chip does not navigate, because the editor cannot open a recipe", async () => {
  // EditorShell routes _meta.yml, the app-context frontmatter forms and plain
  // markdown. A recipe is JSON, so handing its path to onOpenFile lands on the
  // refusal banner. Asserting the string the old test asserted could never
  // catch that: it checked the call, not whether the path routes.
  const opened: string[] = [];
  render(
    wrap(
      <PatternsDashboard
        octokit={fakeGh()}
        onOpenFile={(p) => opened.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Studio"));
  const chip = screen.getAllByText("Studio > Catalog")[0];
  assert.ok(chip);
  fireEvent.click(chip);
  assert.deepEqual(opened, [], "the chip is informative, not a link");
  const titled = screen.getAllByTitle(/not editable in the editor yet/)[0];
  assert.ok(titled, "the chip says why it does not open");
});

test("every path the view opens is one the editor can actually route", async () => {
  const opened: string[] = [];
  render(
    wrap(
      <PatternsDashboard
        octokit={fakeGh()}
        onOpenFile={(p) => opened.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Asset detail 360"));
  // Both navigating affordances: a pattern row and an app's summary line.
  fireEvent.click(screen.getByText("Asset detail 360"));
  fireEvent.click(screen.getByText(/1 use case · 1 pattern named/));
  assert.equal(opened.length, 2);
  for (const path of opened) {
    assert.ok(
      matchFrontmatterForm(path) !== null || isPlainMarkdown(path),
      `${path} is not routable by EditorShell`,
    );
  }
});

test("the per-app line pluralises its pattern count", async () => {
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  // Studio's one use case names one real pattern (the other is a ghost), and
  // Explorer names none, so both the singular and the plural are on the page.
  assert.ok(screen.getByText(/1 use case · 1 pattern named/));
  assert.ok(screen.getByText(/0 use cases · 0 patterns named/));
});

test("a capture naming a missing pattern is called out by name", async () => {
  const RECIPES_BAD = {
    "partly-wrong": {
      slug: "partly-wrong",
      apps: ["studio"],
      patterns: ["right-sliding-drawer", "typo-browse"],
      derivedFrom: { surface: "Studio > Catalog", capturedOn: "2026-08-21" },
    },
  };
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "app-context/dist/recipes")
          return { data: [{ name: "partly-wrong.json", type: "file" }] };
        if (path === "app-context/dist/app-context.json")
          return {
            data: {
              content: b64(JSON.stringify(APP_CONTEXT)),
              encoding: "base64",
            },
          };
        return {
          data: {
            content: b64(JSON.stringify(RECIPES_BAD["partly-wrong"])),
            encoding: "base64",
          },
        };
      },
    },
  } as never;
  render(wrap(<PatternsDashboard octokit={gh} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  assert.ok(screen.getByText(/partly-wrong names typo-browse/));
});

test("the summary counts patterns with no when clause", async () => {
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  // Both fixture patterns carry a when clause, so the count is zero and the
  // sentence still explains what the number means.
  assert.ok(screen.getByText(/0 with no when clause/));
});

test("a long capture surface is truncated on the chip and kept in full on hover", async () => {
  const longSurface =
    "Explorer > Marketplace > Search > result card body > quick view";
  const RECIPES_LONG = {
    "right-sliding-drawer": {
      slug: "right-sliding-drawer",
      apps: ["explorer"],
      patterns: ["right-sliding-drawer"],
      derivedFrom: { surface: longSurface, capturedOn: "2026-08-19" },
    },
  };
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "app-context/dist/recipes")
          return {
            data: [{ name: "right-sliding-drawer.json", type: "file" }],
          };
        if (path === "app-context/dist/app-context.json")
          return {
            data: {
              content: b64(JSON.stringify(APP_CONTEXT)),
              encoding: "base64",
            },
          };
        return {
          data: {
            content: b64(JSON.stringify(RECIPES_LONG["right-sliding-drawer"])),
            encoding: "base64",
          },
        };
      },
    },
  } as never;
  render(wrap(<PatternsDashboard octokit={gh} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  const chip = screen.getAllByTitle(new RegExp(longSurface))[0];
  assert.ok(chip, "the full surface stays available on the title");
  assert.ok(chip instanceof HTMLElement);
  assert.ok(
    (chip.textContent ?? "").length < longSurface.length,
    "the chip label is shorter than the full path",
  );
  assert.ok((chip.textContent ?? "").endsWith("…"));
});

test("the summary states that per-app counts overlap rather than summing them", async () => {
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  assert.ok(
    screen.getByText(/per-app counts below overlap and do not sum to 2/),
  );
});

test("a failed load reports the reason instead of rendering an empty index", async () => {
  const brokenGh = {
    repos: {
      getContent: async () => {
        throw new Error("network is down");
      },
    },
  } as never;
  render(wrap(<PatternsDashboard octokit={brokenGh} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText(/Failed to load patterns/));
  assert.ok(screen.getByText(/network is down/));
});
