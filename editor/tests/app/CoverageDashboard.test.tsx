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
import { CoverageDashboard } from "../../src/app/CoverageDashboard";

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
        if (path === "components/dist/registries/dskit.json") {
          // A load that cannot read the registry now rejects; these screens
          // are not the subject of that rule, so the fake serves an empty one.
          return {
            data: { content: b64(JSON.stringify({ components: {} })), encoding: "base64" },
          };
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

test("CoverageDashboard: renders rows from fixture _meta.yml", async () => {
  render(
    wrap(
      <CoverageDashboard
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Button"));
  assert.ok(screen.getByText("Button"));
  assert.ok(screen.getByText("Tabs"));
});

test("CoverageDashboard: clicking row header opens _meta.yml", async () => {
  const calls: string[] = [];
  render(
    wrap(
      <CoverageDashboard
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={(p) => calls.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Button"));
  fireEvent.click(screen.getByText("Button"));
  assert.deepEqual(calls, ["components/src/button/_meta.yml"]);
});

test("CoverageDashboard: clicking approved cell opens domain.md", async () => {
  const calls: string[] = [];
  render(
    wrap(
      <CoverageDashboard
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={(p) => calls.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Button"));
  // 'ready' = the user-facing label for approved status. Two components
  // each have content=approved, so there are two 'ready' cells; click the first.
  const readyCells = screen.getAllByText("Approved");
  fireEvent.click(readyCells[0]!);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /^components\/src\/(button|tabs)\/content\.md$/);
});

test("CoverageDashboard: clicking inherited cell opens category file", async () => {
  const calls: string[] = [];
  render(
    wrap(
      <CoverageDashboard
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={(p) => calls.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Button"));
  const inheritedCells = screen.getAllByText("Inherited");
  fireEvent.click(inheritedCells[0]!);
  assert.equal(calls.length, 1);
  assert.match(
    calls[0]!,
    /^components\/src\/categories\/(action|navigation)\.md$/,
  );
});

test("CoverageDashboard: the per-domain counts are the matrix, stated once", async () => {
  // This asserted a strip of "2/2 draft" badges beneath the Meters. The matrix
  // replaced both, so the counts moved into the figure's own rows: the subject
  // is the same, the place it lives is not.
  const { container } = render(
    wrap(
      <CoverageDashboard
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Button"));
  const content = container.querySelector('[data-domain="content"]');
  assert.ok(content, "the matrix has no Content row");
  // Both fixture components have content=approved.
  assert.match(
    content.getAttribute("aria-label") ?? "",
    /across 2 components: 2 Approved/,
  );
  assert.equal(screen.queryByText(/2\/2 draft/), null, "the badge strip is back");
});

test("CoverageDashboard: shows error callout when load fails", async () => {
  const errGh = {
    repos: {
      getContent: async () => {
        throw new Error("boom");
      },
    },
  } as any;
  render(wrap(<CoverageDashboard octokit={errGh} onOpenFile={() => {}} />));
  await waitFor(() => screen.getByText(/Failed to load coverage/));
  assert.ok(screen.getByText(/boom/));
});
