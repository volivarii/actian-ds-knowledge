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

/** Asserts a query found nothing.
 *
 *  `assert.equal(node, null)` looks equivalent and is not: when it FAILS, node
 *  builds its diff by walking the actual value, and walking a DOM element's
 *  cyclic graph takes the process out with a SIGKILL after ~26s. The run then
 *  reports the FILE as failed with no assertion name and no location, and
 *  every test after it in the file never runs. Found by mutating the guard
 *  below and reading a green line for a test that had not executed. */
function assertAbsent(node: unknown, message: string) {
  assert.ok(node === null, message);
}

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

test("HomeScreen: the list is ranked usage-first and each row carries one readout", async () => {
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

  // Each row carries one readout, not one badge per absent domain.
  await waitFor(() =>
    assert.ok(
      document.querySelectorAll('[data-testid="coverage-cells"]').length > 0,
      "the needs-attention rows carry no readout",
    ),
  );

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
  // The note now sits with the list it qualifies rather than under the h1,
  // because the count it used to qualify has left this screen. It is a fault
  // report, not a statistic: it renders only when a file could not be read.
  const note = await waitFor(() =>
    screen.getByText(/could not be read and (is|are) not listed: /i),
  );
  assert.match(note.textContent ?? "", /\btabs\b/, "the unreadable slug is not named");
  // And the component it could not read is absent from the work list, rather
  // than listed with five blank domains as though it were unwritten.
  assertAbsent(screen.queryByText(/^Tabs$/), "an unreadable row was listed as work");
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
  await waitFor(() => screen.getByText(/Nothing is missing/i));
  // A backlog that does not exist gets no sentence at all, and one that does
  // gets none either: see the dashboard-prose guard below.
  assertAbsent(screen.queryByText(/is the backlog/i), "a backlog sentence is back");
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

test("HomeScreen: the hub links, it never analyses", async () => {
  // The rule in this screen's own header comment, made enforceable. It was
  // written there and then broken there: a derived sentence sat under the h1
  // reading "31 components have no guidance at all. Of the 54 started, Tokens
  // is the backlog: 42 have none authored." Every clause was true, it
  // contradicted the sidebar's count of 54 for anyone who read both, and the
  // Coverage overview already says it properly. Nothing in the suite objected,
  // because the tests asserted that the sentence was CORRECT rather than that
  // it did not belong.
  render(
    wrap(
      <HomeScreen
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Button"));

  // The structural half: the front door asserts ONE thing, so the block
  // holding the h1 holds the h1's own words and nothing else. Any sentence
  // added beneath the heading fails here whatever it says.
  const h1 = screen.getByRole("heading", { level: 1 });
  const hero = h1.parentElement!;
  assert.equal(
    hero.textContent?.trim(),
    h1.textContent?.trim(),
    `prose is back under the h1: ${hero.textContent}`,
  );

  // The vocabulary half, matched on the SHAPE of a diagnosis rather than on
  // the phrasing that was removed. A proportion ("42 of the 54", "of the 54
  // started", "78%") is a measurement, and measurement is what dashboards do.
  // The two numbers this screen may state are a remainder ("6 more") and a
  // fault count, and neither is a proportion.
  const text = document.body.textContent ?? "";
  const PROPORTION = [
    /\b\d+\s+of\s+(the\s+)?\d+\b/i, // "42 of the 54"
    /\bof the \d+\b/i, // "Of the 54 started": a denominator with no numerator
    /\d+\s?%/,
  ];
  for (const shape of PROPORTION) {
    assert.equal(
      shape.test(text),
      false,
      `a proportion reached the hub: ${text.match(shape)?.[0]}`,
    );
  }
});
