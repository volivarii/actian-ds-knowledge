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

test("HomeScreen: hero, honest counts, and the needs-attention list ranked usage-first", async () => {
  const opened: string[] = [];
  render(
    wrap(
      <HomeScreen
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={(p) => opened.push(p)}
      />,
    ),
  );

  // Hero heading renders synchronously, before the coverage fetch resolves.
  screen.getByText(/Browse and edit the design system/i);

  // Coverage-derived copy arrives after the fake fetch resolves.
  await waitFor(() =>
    screen.getByText(/1 started component still lacks usage guidance/i),
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
  // The HERO's note, beside the count it qualifies. The phrasing is matched
  // exactly because two other notes on this page also say "could not be
  // read": the embedded coverage dashboard's row note ("not counted above or
  // in the table") and its media-index note, which names no slug. A looser
  // match stayed green with the hero note deleted.
  const note = await waitFor(() =>
    screen.getByText(/could not be read and (is|are) not counted: /i),
  );
  assert.match(note.textContent ?? "", /\btabs\b/, "the unreadable slug is not named");
  // The count is derived from the fixture, not pinned: every readable dir is
  // an authored row (the fake registry is empty, so there are no ghosts).
  const readable = DIRS.filter(
    (d) =>
      d.type === "dir" &&
      d.name !== "tabs" &&
      !["categories", "guidelines"].includes(d.name),
  ).length;
  screen.getByText(
    new RegExp(`${readable} of ${readable} components have authored`, "i"),
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
  await waitFor(() =>
    screen.getByText(/Every started component's usage guidance is underway/i),
  );
  screen.getByText(/Nothing is missing/i);
  assert.equal(screen.queryByText(/0 started components/i), null);
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

test("HomeScreen: how-it-works discloses the three-step loop", async () => {
  render(
    wrap(
      <HomeScreen
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={() => {}}
      />,
    ),
  );
  assert.equal(screen.queryByText(/A pull request opens/i), null);
  fireEvent.click(screen.getByRole("button", { name: /Show the steps/i }));
  screen.getByText(/A pull request opens/i);
  screen.getByText(/The system does the rest/i);
  fireEvent.click(screen.getByRole("button", { name: /Hide the steps/i }));
  assert.equal(screen.queryByText(/A pull request opens/i), null);
});

test("HomeScreen: one h1, sections as h2 — a navigable heading outline", () => {
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
  assert.deepEqual(h2s, ["Start here", "Needs attention", "Explore the data"]);
});

test("HomeScreen: explore section carries the three data tabs", async () => {
  render(
    wrap(
      <HomeScreen
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={() => {}}
      />,
    ),
  );
  screen.getByRole("tab", { name: /Coverage/i });
  screen.getByRole("tab", { name: /Accessibility/i });
  const rel = screen.getByRole("tab", { name: /Relationships/i });
  // Radix Tabs.Trigger activates on mousedown.
  fireEvent.mouseDown(rel);
  await waitFor(() => screen.getByText(/Substrate relationship health/i));
});
