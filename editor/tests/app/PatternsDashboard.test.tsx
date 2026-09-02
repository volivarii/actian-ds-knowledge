import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
  within,
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
    label: "Studio quick edit drawer",
    apps: ["studio"],
    patterns: ["right-sliding-drawer"],
    description: "A drawer that edits one asset without leaving the list.",
    when: "Use when an edit is short enough that a full page would lose the reader's place.",
    tags: ["overlay", "edit"],
    derivedFrom: {
      surface: "Studio > Catalog",
      capturedOn: "2026-08-20",
      productVersion: "next.dev.zeenea.app/studio",
    },
    slots: {
      header: "Asset title over the technical path.",
      tabs: "A tab bar whose labels carry result counts.",
    },
    renderNotes: ["Do NOT compose this from fmDialog: it is a stub."],
    skeleton: {
      content: [
        {
          type: "FRAME",
          name: "Quick edit drawer",
          sizing: { horizontal: 550, vertical: "FILL" },
          children: [
            { type: "TEXT", name: "Title", content: "Item title" },
            {
              type: "INSTANCE",
              ref: "fmTag",
              variant: "Style=Light",
              props: { "Tag Text": "Shared" },
            },
          ],
        },
      ],
    },
  },
  "explorer-quick-view": {
    slug: "explorer-quick-view",
    label: "Explorer quick view",
    apps: ["explorer"],
    patterns: ["right-sliding-drawer"],
    when: "Use for a peek that leaves the result list live.",
    derivedFrom: { surface: "Explorer > Marketplace", capturedOn: "2026-08-19" },
    slots: { body: "The item summary." },
    skeleton: {
      content: [{ type: "FRAME", name: "Explorer drawer" }],
    },
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

test("a capture chip opens the recipe panel without handing a path to the router", async () => {
  // EditorShell routes _meta.yml, the app-context frontmatter forms and plain
  // markdown. A recipe is JSON, so handing its path to onOpenFile would land on
  // the refusal banner. The chip now opens a read-only panel instead, and the
  // original guarantee still holds: it routes nowhere.
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
  assert.deepEqual(opened, [], "the chip opens a panel, it does not route");
  await waitFor(() =>
    screen.getByText(
      /Use when an edit is short enough that a full page would lose/,
    ),
  );
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

test("the summary states that per-product counts overlap rather than summing them", async () => {
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  assert.ok(
    screen.getByText(/per-product counts below overlap and do not sum to 2/),
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

// ---------------------------------------------------------------------------
// The recipe panel. Read-only by decision: editing a recipe is the Class C JSON
// widget the RefusalBanner still names as unbuilt, and painting the skeleton
// needs the plugin's render-node.js. What a reviewer needs first is the prose,
// and every field below was already parsed off disk and then dropped.

/**
 * Opens the one capture and returns the PANEL, so assertions are scoped to it.
 * The surface string is on the chip as well, and a bare screen query would pass
 * on the chip while the panel showed nothing.
 */
async function openTheCapture(): Promise<HTMLElement> {
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  const chip = screen.getAllByText("Studio > Catalog")[0];
  assert.ok(chip);
  fireEvent.click(chip);
  return waitFor(() =>
    screen.getByRole("region", { name: /Studio quick edit drawer/ }),
  );
}

test("the panel leads with where the capture came from and when", async () => {
  // A capture's credibility is its provenance. Showing the prose without it
  // invites a reviewer to correct a page that no longer exists.
  const panel = await openTheCapture();
  assert.ok(within(panel).getByText(/Studio > Catalog/));
  assert.ok(within(panel).getByText(/2026-08-20/));
  assert.ok(within(panel).getByText(/next\.dev\.zeenea\.app\/studio/));
});

test("the panel lists every slot by name with its prose intact", async () => {
  await openTheCapture();
  assert.ok(screen.getByText("header"));
  assert.ok(screen.getByText("Asset title over the technical path."));
  assert.ok(screen.getByText("tabs"));
  assert.ok(screen.getByText("A tab bar whose labels carry result counts."));
});

test("the panel surfaces the render notes, which nothing else shows", async () => {
  await openTheCapture();
  assert.ok(
    screen.getByText(/Do NOT compose this from fmDialog: it is a stub\./),
  );
});

test("the panel shows the when clause in full rather than truncated", async () => {
  // The table truncates to 42 characters. The whole point of the panel is that
  // the longest prose in the substrate becomes readable.
  await openTheCapture();
  assert.ok(
    screen.getByText(
      "Use when an edit is short enough that a full page would lose the reader's place.",
    ),
  );
});

test("the panel offers the SOURCE json as where an edit goes, not the dist it read", async () => {
  // The panel reads app-context/dist/recipes (derived, validated, already
  // loaded) and a correction belongs in app-context/src/recipes. A link to the
  // dist would send a reviewer to a file CI overwrites.
  await openTheCapture();
  const link = screen.getByRole("link", { name: /source/i }) as HTMLAnchorElement;
  assert.match(
    link.href,
    /app-context\/src\/recipes\/studio-quick-edit-drawer\.json$/,
  );
  assert.ok(
    !link.href.includes("/dist/"),
    "an edit must never be aimed at the generated copy",
  );
});

test("the panel reports the skeleton's size and keeps the outline collapsed", async () => {
  // Painting needs the plugin's render-node.js. Until that decision lands the
  // panel is honest about what it shows: an outline, and how big it is. The
  // four captures on disk run 30 to 142 nodes at depth 7, so opening expanded
  // would bury the prose the reviewer came for.
  await openTheCapture();
  const count = screen.getByText(/3 nodes/);
  const details = count.closest("details");
  assert.ok(details, "the outline sits behind a disclosure");
  assert.equal(details.open, false, "142 nodes is a wall, so it opens on request");
});

test("expanding the outline names the nodes without painting them", async () => {
  await openTheCapture();
  fireEvent.click(screen.getByText(/3 nodes/));
  assert.ok(screen.getByText("Quick edit drawer"));
  assert.ok(screen.getByText("550 x FILL"), "a declared size is read off, not drawn");
  assert.ok(screen.getByText(/Item title/), "a TEXT node keeps its words");
});

test("closing the panel returns the reader to the table", async () => {
  await openTheCapture();
  fireEvent.click(screen.getByRole("button", { name: /close/i }));
  await waitFor(() =>
    assert.equal(screen.queryByText(/Asset title over the technical path\./), null),
  );
  assert.ok(screen.getByText("Studio"), "the table is still there");
});

test("opening a capture brings the panel into view", async () => {
  // The panel renders above the tables, and a chip can sit far down a page of
  // three app blocks. Without this the reader clicks and sees nothing move,
  // which is exactly the "reads as broken" failure the chip used to avoid by
  // not being clickable at all.
  const proto = Element.prototype as unknown as {
    scrollIntoView: () => void;
  };
  const original = proto.scrollIntoView;
  const scrolled: string[] = [];
  proto.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this.getAttribute("aria-label") ?? this.tagName);
  };
  try {
    await openTheCapture();
    assert.ok(
      scrolled.some((label) => /Studio quick edit drawer/.test(label)),
      `the panel was never scrolled to; saw ${JSON.stringify(scrolled)}`,
    );
  } finally {
    proto.scrollIntoView = original;
  }
});

test("the outline shows an instance's component rather than a bare type word", async () => {
  const panel = await openTheCapture();
  fireEvent.click(within(panel).getByText(/nodes$/));
  assert.ok(
    within(panel).getByText("fmTag"),
    "an instance row must name the component it instantiates",
  );
  assert.ok(within(panel).getByText("Style=Light"));
});


// --------------------------------------------------------------------- review
// Findings from the pre-commit review of this change. Each asserts a behaviour
// the 1176-test suite passed while the defect was present.

test("a capture chip opens the panel from the keyboard", async () => {
  // The chip is a Radix Badge, which renders a span. With only onClick a
  // keyboard user can never reach the panel, so the whole feature is mouse
  // only. RelationsPanel already owns this contract (role, tabIndex, Enter).
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  const chip = screen.getAllByText("Studio > Catalog")[0];
  assert.ok(chip);
  assert.equal(chip.getAttribute("role"), "button");
  assert.equal(chip.getAttribute("tabindex"), "0");
  fireEvent.keyDown(chip, { key: "Enter" });
  await waitFor(() =>
    screen.getByRole("region", { name: /Studio quick edit drawer/ }),
  );
});

test("re-opening the capture already on screen scrolls to it again", async () => {
  // buildPatternIndex maps recipes once, so one recipe OBJECT is shared by
  // every row naming it. setState with the same object is a React bail-out:
  // no re-render, no scroll, and the reader who scrolled away sees nothing
  // move. That is the "reads as broken" failure this chip is meant to avoid.
  const proto = Element.prototype as unknown as { scrollIntoView: () => void };
  const original = proto.scrollIntoView;
  let scrolls = 0;
  proto.scrollIntoView = function scrollIntoView() {
    scrolls += 1;
  };
  try {
    render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
    await waitFor(() => screen.getByText("Studio"));
    const chip = screen.getAllByText("Studio > Catalog")[0];
    assert.ok(chip);
    fireEvent.click(chip);
    await waitFor(() =>
      screen.getByRole("region", { name: /Studio quick edit drawer/ }),
    );
    const afterFirst = scrolls;
    fireEvent.click(chip);
    await waitFor(() => assert.ok(scrolls > afterFirst));
  } finally {
    proto.scrollIntoView = original;
  }
});

test("switching captures returns the outline to collapsed", async () => {
  // `open` is DOM state on <details>. Without a key per opening React reuses
  // the element, so a reader who expanded a 30-node outline then opened a
  // 142-node capture would land on it fully expanded, burying the prose the
  // panel exists to surface.
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  const studioChip = screen.getAllByText("Studio > Catalog")[0];
  assert.ok(studioChip);
  fireEvent.click(studioChip);
  const panel = await waitFor(() =>
    screen.getByRole("region", { name: /Studio quick edit drawer/ }),
  );
  const summary = within(panel).getByText(/nodes$/);
  fireEvent.click(summary);
  assert.equal(summary.closest("details")?.open, true);

  const explorerChip = screen.getAllByText("Explorer > Marketplace")[0];
  assert.ok(explorerChip);
  fireEvent.click(explorerChip);
  const next = await waitFor(() =>
    screen.getByRole("region", { name: /Explorer quick view/ }),
  );
  assert.equal(
    within(next).getByText(/nodes$/).closest("details")?.open,
    false,
    "a fresh capture opens collapsed",
  );
});

test("an instance's props are read, since that is where its words live", async () => {
  const panel = await openTheCapture();
  fireEvent.click(within(panel).getByText(/nodes$/));
  assert.ok(within(panel).getByText(/Tag Text/));
  assert.ok(within(panel).getByText(/Shared/));
});

test("closing the panel returns focus to the chip that opened it", async () => {
  // A keyboard user who tabbed into the panel and pressed Close would otherwise
  // land on <body> and have to tab from the top of the page to get back. Opening
  // by keyboard is only half the fix if closing strands the reader.
  render(wrap(<PatternsDashboard octokit={fakeGh()} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText("Studio"));
  const chip = screen.getAllByText("Studio > Catalog")[0];
  assert.ok(chip);
  fireEvent.click(chip);
  const panel = await waitFor(() =>
    screen.getByRole("region", { name: /Studio quick edit drawer/ }),
  );
  fireEvent.click(within(panel).getByRole("button", { name: /close/i }));
  // assert.ok, never assert.equal: a failing equal on two DOM nodes sends
  // node's diff builder recursing through the tree and the process is SIGKILLed
  // before it can print anything.
  await waitFor(() =>
    assert.ok(
      document.activeElement === chip,
      "focus must return to the chip that opened the panel",
    ),
  );
});
