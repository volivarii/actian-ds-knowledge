// The page, not the component. `HomeScreen.test` asserts "one h1" and passed
// while the deployed page had nine, because it mounted the screen without the
// shell (#653). These mount the real EditorShell with the real Sidebar.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { EditorShell } from "../../src/app/EditorShell";

afterEach(cleanup);

import { b64 } from "../helpers/fakeOctokit";

/** One component directory, an empty registry, every file 404, every other
 *  directory empty. One entry is what makes a sidebar section renderable. */
function fakeGh() {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/dist/registries/dskit.json") {
          return {
            data: { content: b64(JSON.stringify({ components: {} })), encoding: "base64" },
          };
        }
        if (path === "components/src") return { data: [{ name: "button", type: "dir" }] };
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

function mountShell(activePath: string | null, navigationSerial = 0) {
  localStorage.clear();
  sessionStorage.clear(); // the sidebar's collapse state lives here
  const gh = fakeGh();
  const ui = (serial: number) => (
    <Theme>
      <EditorShell
        octokit={gh}
        activePath={activePath}
        setActivePath={() => {}}
        navigationSerial={serial}
      />
    </Theme>
  );
  const r = render(ui(navigationSerial));
  return { ...r, renavigate: (serial: number) => r.rerender(ui(serial)) };
}

test("the shell has one nav and one main, and the main can be skipped to", async () => {
  const { container } = mountShell(null);
  // Wait for the NAV: Home's h1 renders synchronously, so waiting on it
  // proved nothing about the sidebar, which appears only after its loaders.
  await waitFor(() => assert.ok(container.querySelector("nav")));
  const navs = container.querySelectorAll("nav");
  assert.equal(navs.length, 1, `expected one nav, found ${navs.length}`);
  // Named for what it spans (Home, Drafts, the design system AND the
  // application context), not for its first dimension.
  assert.equal(navs[0]!.getAttribute("aria-label"), "Repository sections");
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
  await waitFor(() => assert.ok(container.querySelector("nav")));
  const h1s = [...container.querySelectorAll("h1")].map((h) => h.textContent);
  assert.deepEqual(h1s, ["Browse and edit the design system."], `h1s: ${h1s.join(" | ")}`);
  const nav = container.querySelector("nav")!;
  assert.equal(
    nav.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
    0,
    "sidebar section labels render as headings",
  );
  // ...and the labels still name their groups. Sections start collapsed and
  // a collapsed section renders no group, so one is opened first; a loop over
  // zero groups proved nothing (and `CSS.escape` does not exist in jsdom).
  fireEvent.click(container.querySelector("#sidebar-section-components-header")!);
  await waitFor(() =>
    assert.ok(nav.querySelector('[role="group"][aria-labelledby]'), "no group rendered"),
  );
  const groups = nav.querySelectorAll('[role="group"][aria-labelledby]');
  assert.ok(groups.length > 0);
  for (const g of groups) {
    const id = g.getAttribute("aria-labelledby")!;
    const label = document.getElementById(id);
    assert.ok(label, `group label #${id} is missing`);
    assert.ok((label.textContent ?? "").trim().length > 0, `group label #${id} is empty`);
  }
});

test("the draft inbox in the shell has exactly one h1", async () => {
  const { container } = mountShell("inbox");
  await waitFor(() => assert.ok(container.querySelector("nav")));
  const h1s = [...container.querySelectorAll("h1")].map((h) => h.textContent);
  assert.equal(h1s.length, 1, `h1s: ${h1s.join(" | ")}`);
});

test("every navigation resets the screen boundary, not only a path change", async () => {
  // Home again, the same file from search or the palette, or a hash route
  // change none of which alter the path. App bumps a serial on every
  // navigation; the shell folds it into the boundary's reset key.
  const { container, renavigate } = mountShell(null, 1);
  await waitFor(() => assert.ok(container.querySelector("nav")));
  const key1 = container.querySelector("[data-screen-boundary]")!.getAttribute("data-reset-key");
  assert.ok(key1, "the boundary does not expose its reset key");
  renavigate(2);
  const key2 = container.querySelector("[data-screen-boundary]")!.getAttribute("data-reset-key");
  assert.notEqual(key2, key1, "re-selecting the same screen did not change the reset key");
});
