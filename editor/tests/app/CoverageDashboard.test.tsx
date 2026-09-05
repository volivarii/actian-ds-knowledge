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
  /** DS Kit entries with no `_meta.yml`, which the loader turns into ghost
   *  rows. Defaults to none. Without one, a test about the difference between
   *  the authored count and the registry count has no difference to see. */
  registry?: Record<string, unknown>;
}) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/src") return { data: opts.dirs };
        if (path === "components/dist/registries/dskit.json") {
          // A load that cannot read the registry now rejects; these screens
          // are not the subject of that rule, so the fake serves an empty one.
          return {
            data: {
              content: b64(JSON.stringify({ components: opts.registry ?? {} })),
              encoding: "base64",
            },
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
  assert.equal(
    screen.queryByText(/2\/2 draft/),
    null,
    "the badge strip is back",
  );
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

test("CoverageDashboard: the table sits inside the disclosure, open at rest", async () => {
  // The figure answers "where does this stand" and the table answers "open
  // this one". A 9px matrix cell is below the 24px target floor, so the figure
  // can never be the thing you click to open one component's guidance, which
  // makes the table the only part of this screen you can act on. It is open at
  // rest for that reason. The disclosure stays so the figure can be read
  // alone, and the table stays INSIDE it either way, which is what the join
  // below asserts.
  const { container } = render(
    wrap(
      <CoverageDashboard
        octokit={fakeGh({ dirs: DIRS, files: FILES })}
        onOpenFile={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Button"));

  const details = container.querySelector(
    "details[data-testid='coverage-table-disclosure']",
  ) as HTMLDetailsElement | null;
  assert.ok(details, "the disclosure is gone");
  assert.equal(details!.open, true, "the table is shut at rest again");

  // The JOIN, not merely the presence of both: a details element beside a
  // table would satisfy two separate existence checks and ship the defect.
  const table = container.querySelector("table");
  assert.ok(table, "the table is gone entirely");
  assert.ok(
    details!.contains(table!),
    "the table is on the page but outside the disclosure",
  );

  // And the figure is NOT inside it, or the page at rest would be empty.
  const matrix = container.querySelector("[data-testid='coverage-matrix']");
  assert.ok(matrix, "the matrix is gone");
  assert.equal(
    details!.contains(matrix!),
    false,
    "the figure got shut inside the disclosure with the table",
  );
});

test("CoverageDashboard: offers the verb for the finding it states", async () => {
  // A page that says "Tokens is the backlog" and then offers only "Export as
  // CSV" has named a job and handed the reader a spreadsheet.
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

  // Both fixture rows have tokens not-started, so tokens is the gap at 2;
  // usage and behavior sit at 1 each.
  const sentence = screen.getByText(/is the backlog/);
  assert.match(
    sentence.textContent ?? "",
    /Tokens is the backlog: 2 of the 2 have none\./,
  );

  const button = screen.getByRole("button", { name: /Start the Tokens pass/ });
  fireEvent.click(button);
  assert.equal(calls.length, 1);
  // Whichever component is first, it must be one that actually lacks tokens.
  assert.match(calls[0]!, /^components\/src\/(button|tabs)\/_meta\.yml$/);
});

test("CoverageDashboard: the sentence does not state two counts for one thing", async () => {
  // The registry entry is the whole test. Written first against the default
  // empty registry, it passed on the OLD sentence too, because with no ghost
  // rows `rows.length` and the authored count are the same number: a guard
  // that cannot tell the defect from the fix.
  render(
    wrap(
      <CoverageDashboard
        octokit={fakeGh({
          dirs: DIRS,
          files: FILES,
          // `section: "Components"` is what makes an entry eligible
          // (graphEligibility.COMPONENT_SECTION). Without it the loader
          // discards the entry and no ghost row appears, which is how this
          // test first passed against the defect.
          registry: {
            button: {
              name: "Button",
              category: "action",
              section: "Components",
            },
            tabs: {
              name: "Tabs",
              category: "navigation",
              section: "Components",
            },
            modal: {
              name: "Modal",
              category: "overlays",
              section: "Components",
            },
          },
        })}
        onOpenFile={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Button"));
  // The deployed page opened "85 components" while the sidebar two inches
  // away said 54, because 85 counted registry components nobody had started.
  const sentence = screen.getByText(/components authored/);
  assert.match(
    sentence.textContent ?? "",
    /^2 components authored, 1 more in the registry with nothing yet\./,
  );
  assert.equal(
    /\b3 components\b/.test(sentence.textContent ?? ""),
    false,
    `authored and registry counts merged again: ${sentence.textContent}`,
  );
});
