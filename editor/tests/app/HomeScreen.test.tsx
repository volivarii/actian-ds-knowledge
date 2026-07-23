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
}) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/src") return { data: opts.dirs };
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
