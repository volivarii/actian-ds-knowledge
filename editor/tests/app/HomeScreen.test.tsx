// tests/app/HomeScreen.test.tsx — the editor's front door.
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
import { HomeScreen } from "../../src/app/HomeScreen";
import { SCOPES } from "../../src/app/scopes";

afterEach(() => cleanup());

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

function fakeGh(opts: {
  dirs: Array<{ name: string; type: "dir" | "file" }>;
  files: Record<string, string>;
  /** slugs whose _meta.yml answers 403 rather than 404 */
  throttle?: string[];
}) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/src") return { data: opts.dirs };
        if (path === "components/dist/registries/dskit.json") {
          // A load that cannot read the registry now rejects; these screens
          // are not the subject of that rule, so the fake serves an empty one.
          return {
            data: { content: b64(JSON.stringify({ components: {} })), encoding: "base64" },
          };
        }
        if (
          (opts.throttle ?? []).some((s) => path === `components/src/${s}/_meta.yml`)
        ) {
          const err = new Error("forbidden") as Error & { status: number };
          err.status = 403;
          throw err;
        }
        const content = opts.files[path];
        if (content === undefined) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return { data: { content: b64(content), encoding: "base64" } };
      },
    },
  } as any;
}

const DIRS = [
  { name: "button", type: "dir" as const },
  { name: "tabs", type: "dir" as const },
  { name: "categories", type: "dir" as const },
];

const FILES = {
  "components/src/button/_meta.yml": `
component: "Button"
category: action
domains:
  content: { status: approved }
  usage: { status: draft }
  design: { status: inherited }
  behavior: { status: not-started }
  tokens: { status: not-started }
`,
  "components/src/tabs/_meta.yml": `
component: "Tabs"
category: navigation
domains:
  content: { status: approved }
  usage: { status: not-started }
  design: { status: inherited }
  behavior: { status: inherited }
  tokens: { status: not-started }
`,
};

test("HomeScreen: the backlog in a sentence, and the list ranked usage-first", async () => {
  const opened: string[] = [];
  render(
    wrap(
      <HomeScreen
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={(p) => opened.push(p)}
      />,
    ),
  );

  // The heading renders synchronously, before the coverage fetch resolves.
  screen.getByText(/Author the design system/i);

  // The backlog sentence is DERIVED: the fixture leaves tokens not-started on
  // every started row, so tokens is the largest gap and the sentence has to
  // name it. A hard-coded sentence would pass this with the wrong domain.
  await waitFor(() => screen.getByText(/is the backlog: \d+ have none/i));
  const sentence = screen.getByText(/is the backlog: \d+ have none/i);
  assert.match(
    sentence.textContent ?? "",
    /Of the \d+ started, Tokens is the backlog/,
    `sentence reads: ${sentence.textContent}`,
  );
  // A component nobody has started is missing all five domains, not one, so
  // it must not be folded into a per-domain gap. The fixture has no ghosts,
  // so no "no guidance at all" clause may appear.
  assert.equal(screen.queryByText(/no guidance at all/i), null);

  // Each row carries one readout, not one badge per absent domain.
  const readouts = document.querySelectorAll('[data-testid="coverage-cells"]');
  assert.ok(readouts.length > 0, "the needs-attention rows carry no readout");

  // Tabs (usage not-started) outranks Button (only behavior/tokens missing).
  const writeUsage = screen.getByRole("button", {
    name: /Write usage guidance/i,
  });
  fireEvent.click(writeUsage);
  assert.deepEqual(opened, ["workspace/tabs"]);

  const continueBtn = screen.getByRole("button", {
    name: /Continue authoring/i,
  });
  fireEvent.click(continueBtn);
  assert.deepEqual(opened, ["workspace/tabs", "workspace/button"]);
});

test("HomeScreen: a component that could not be read is named, not counted", async () => {
  // The loader moves an unreadable _meta.yml out of the rows every consumer
  // counts. Home shows the count those rows feed, so it has to say what was
  // left out, or "N components" is a quietly smaller number than the
  // repository holds.
  render(
    wrap(
      <HomeScreen
        octokit={fakeGh({ dirs: DIRS, files: FILES, throttle: ["tabs"] })}
        onOpenFile={() => {}}
      />,
    ),
  );
  // The HERO's note, beside the count it qualifies. The phrasing is matched
  // exactly because two other notes on this page also say "could not be
  // read": the embedded coverage dashboard's row note ("not counted above or
  // in the table") and its media-index note, which names no slug. A looser
  // match stayed green with the hero note deleted.
  const note = await waitFor(() =>
    screen.getByText(/could not be read and (is|are) not counted: /i),
  );
  assert.match(note.textContent ?? "", /\btabs\b/, "the unreadable slug is not named");
  // The denominator in the backlog sentence is derived from the rows that
  // were READ, so it must not count the throttled one. Pinning the number
  // here would let the sentence keep counting a row it could not measure.
  const readable = DIRS.filter(
    (d) =>
      d.type === "dir" &&
      d.name !== "tabs" &&
      !["categories", "guidelines"].includes(d.name),
  ).length;
  const sentence = screen.getByText(/is the backlog: \d+ have none/i);
  assert.match(
    sentence.textContent ?? "",
    new RegExp(`Of the ${readable} started`),
    `sentence reads: ${sentence.textContent}`,
  );
});

test("HomeScreen: zero gaps shows the all-covered state, not a zero count", async () => {
  const COVERED = {
    "components/src/button/_meta.yml": `
component: "Button"
category: action
domains:
  content: { status: approved }
  usage: { status: approved }
  design: { status: approved }
  behavior: { status: approved }
  tokens: { status: approved }
`,
  };
  render(
    wrap(
      <HomeScreen
        octokit={fakeGh({
          dirs: [{ name: "button", type: "dir" as const }],
          files: COVERED,
        })}
        onOpenFile={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText(/have every domain underway/i));
  screen.getByText(/Nothing is missing/i);
  // "0 have none authored" is a sentence about a backlog that does not exist.
  // The hub says nothing is open rather than putting a zero on screen.
  assert.equal(screen.queryByText(/is the backlog/i), null);
  assert.equal(screen.queryByText(/no guidance at all/i), null);
});

test("HomeScreen: Find a component opens the palette callback", async () => {
  let paletteOpens = 0;
  render(
    wrap(
      <HomeScreen
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={() => {}}
        onFindComponent={() => {
          paletteOpens += 1;
        }}
      />,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /Find a component/i }));
  assert.equal(paletteOpens, 1);
});

test("HomeScreen: one h1, sections as h2, a navigable heading outline", () => {
  const { container } = render(
    wrap(
      <HomeScreen
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={() => {}}
      />,
    ),
  );
  assert.equal(container.querySelectorAll("h1").length, 1);
  const h2s = Array.from(container.querySelectorAll("h2")).map(
    (el) => el.textContent,
  );
  assert.deepEqual(h2s, ["Worth doing next", "Scopes"]);
});

test("HomeScreen: the hub links out to overviews and hosts no tabs", () => {
  const opened: string[] = [];
  render(
    wrap(
      <HomeScreen
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={(p) => opened.push(p)}
      />,
    ),
  );
  // The four panels are gone. A tab left behind would mean the front door is
  // still rendering a dashboard it also links to.
  assert.equal(screen.queryAllByRole("tab").length, 0);

  // Every scope that declares an overview offers a way in, and the target is
  // the screen's own activePath, so the address bar names where you landed.
  const withOverview = SCOPES.filter((sc) => sc.overview !== null);
  assert.ok(withOverview.length > 0, "no scope declares an overview");
  const buttons = screen.getAllByRole("button", { name: /Open the overview/i });
  assert.equal(buttons.length, withOverview.length + 1, "substrate health is missing its way in");
  fireEvent.click(buttons[0] as HTMLElement);
  assert.deepEqual(opened, [withOverview[0]?.overview]);
});

test("HomeScreen: a scope with no overview yet says so rather than hiding", () => {
  render(
    wrap(
      <HomeScreen
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={() => {}}
      />,
    ),
  );
  const pending = SCOPES.filter((sc) => sc.overview === null);
  for (const sc of pending) screen.getByText(sc.label);
  assert.equal(
    screen.getAllByText(/No overview yet/i).length,
    pending.length,
    "a scope without an overview vanished, which makes the structure look finished",
  );
});
