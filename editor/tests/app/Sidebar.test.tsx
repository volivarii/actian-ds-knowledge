import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { Sidebar } from "../../src/app/Sidebar";

afterEach(() => cleanup());

function fakeGh(
  listings: Record<string, Array<{ name: string; type: "file" | "dir" }>>,
) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (!(path in listings)) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return { data: listings[path] };
      },
    },
  } as any;
}

const LISTINGS = {
  "foundations/src": [
    { name: "foundations.md", type: "file" as const },
    { name: "AUTHORING.md", type: "file" as const },
  ],
  accessibility: [
    { name: "accessibility.md", type: "file" as const },
    { name: "AUTHORING.md", type: "file" as const },
  ],
  "components/src": [
    { name: "button", type: "dir" as const },
    { name: "checkbox", type: "dir" as const },
    { name: "categories", type: "dir" as const },
  ],
};

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

test("Sidebar: renders Foundations + Accessibility entries", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("foundations.md"));
  assert.ok(screen.getByText("foundations.md"));
  assert.ok(screen.getByText("accessibility.md"));
});

test("Sidebar: excludes AUTHORING.md", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("foundations.md"));
  assert.equal(screen.queryByText("AUTHORING.md"), null);
});

test("Sidebar: excludes categories (skip-dir)", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("button"));
  assert.equal(screen.queryByText("categories"), null);
});

test("Sidebar: click dispatches onSelect with full path", async () => {
  const calls: (string | null)[] = [];
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={(p) => calls.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("foundations.md"));
  fireEvent.click(screen.getByText("foundations.md"));
  assert.deepEqual(calls, ["foundations/src/foundations.md"]);
});

test("Sidebar: renders a Coverage entry at the top", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Coverage"));
  assert.ok(screen.getByText("Coverage"));
});

test("Sidebar: clicking Coverage calls onSelect with null", async () => {
  const calls: (string | null)[] = [];
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={"foundations/src/foundations.md"}
        onSelect={(p) => calls.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Coverage"));
  fireEvent.click(screen.getByText("Coverage"));
  assert.deepEqual(calls, [null]);
});

test("Sidebar: shows draft-dot for paths in pendingPaths", async () => {
  const pending = new Set(["foundations/src/foundations.md"]);
  const { container } = render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={pending}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("foundations.md"));
  const dots = container.querySelectorAll(".draft-dot");
  assert.equal(dots.length, 1);
});
