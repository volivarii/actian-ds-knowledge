// The page, not the component. `HomeScreen.test` asserts "one h1" and passed
// while the deployed page had nine, because it mounted the screen without the
// shell (#653). These mount the real EditorShell with the real Sidebar.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { EditorShell } from "../../src/app/EditorShell";

afterEach(cleanup);

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

/** Every directory lists empty, the registry is empty, every file is 404. */
function fakeGh() {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/dist/registries/dskit.json") {
          return {
            data: { content: b64(JSON.stringify({ components: {} })), encoding: "base64" },
          };
        }
        if (!/\.[a-z]+$/.test(path)) return { data: [] };
        const err = new Error("not found") as Error & { status: number };
        err.status = 404;
        throw err;
      },
      listCommits: async () => ({ data: [] }),
    },
    git: {},
    pulls: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function mountShell(activePath: string | null) {
  localStorage.clear();
  return render(
    <Theme>
      <EditorShell octokit={fakeGh()} activePath={activePath} setActivePath={() => {}} />
    </Theme>,
  );
}

test("the shell has one nav and one main, and the main can be skipped to", async () => {
  const { container } = mountShell(null);
  await waitFor(() => assert.ok(container.querySelector("h1")));
  const navs = container.querySelectorAll("nav");
  assert.equal(navs.length, 1, `expected one nav, found ${navs.length}`);
  assert.ok(navs[0]!.getAttribute("aria-label"), "the nav has no accessible name");
  const mains = container.querySelectorAll("main");
  assert.equal(mains.length, 1, `expected one main, found ${mains.length}`);
  assert.equal(mains[0]!.id, "main", "the skip link target is #main");
  // The screen renders INSIDE the boundary, so a throw takes the screen and
  // not the shell (#651).
  assert.ok(
    mains[0]!.querySelector("[data-screen-boundary]"),
    "the main pane is not wrapped in the screen error boundary",
  );
});

test("Home in the shell has exactly one h1, and the sidebar labels are not headings", async () => {
  const { container } = mountShell(null);
  await waitFor(() => assert.ok(container.querySelector("h1")));
  const h1s = [...container.querySelectorAll("h1")].map((h) => h.textContent);
  assert.deepEqual(h1s, ["Browse and edit the design system."], `h1s: ${h1s.join(" | ")}`);
  const nav = container.querySelector("nav")!;
  assert.equal(
    nav.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
    0,
    "sidebar section labels render as headings",
  );
  // ...and the labels still name their groups.
  const groups = nav.querySelectorAll('[role="group"][aria-labelledby]');
  for (const g of groups) {
    const id = g.getAttribute("aria-labelledby")!;
    assert.ok(container.querySelector(`#${CSS.escape(id)}`), `group label #${id} is missing`);
  }
});

test("the draft inbox in the shell has exactly one h1", async () => {
  const { container } = mountShell("inbox");
  await waitFor(() => assert.ok(container.querySelector("h1")));
  const h1s = [...container.querySelectorAll("h1")].map((h) => h.textContent);
  assert.equal(h1s.length, 1, `h1s: ${h1s.join(" | ")}`);
});
