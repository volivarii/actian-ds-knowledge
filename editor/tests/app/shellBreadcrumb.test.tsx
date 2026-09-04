// Split from shellLandmarks.test.tsx: mounting a file screen inside the shell
// leaks a handle under jsdom and the file hangs after its tests pass. Under
// happy-dom the same mount unmounts cleanly.
import "../setup-happy-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { EditorShell } from "../../src/app/EditorShell";
import { b64 } from "../helpers/fakeOctokit";
import { setWysiwygFlag } from "../helpers/editorSurface";

afterEach(cleanup);

if (!globalThis.sessionStorage) {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    },
  });
}

function fakeGh() {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/dist/registries/dskit.json") {
          return { data: { content: b64(JSON.stringify({ components: {} })), encoding: "base64" } };
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

test("the back-to-workspace control survives a screen failure", async () => {
  // The breadcrumb used to be a sibling of the pane, outside any boundary.
  // Inside it, the one exit from a failed child screen fell with the screen.
  setWysiwygFlag("source");
  localStorage.clear();
  const { container } = render(
    <Theme>
      <EditorShell
        octokit={fakeGh()}
        activePath="components/src/button/usage.md"
        setActivePath={() => {}}
      />
    </Theme>,
  );
  await waitFor(() => assert.ok(container.querySelector("nav")));
  const back = [...container.querySelectorAll("button")].find((b) =>
    /back to workspace/i.test(b.textContent ?? ""),
  );
  assert.ok(back, "no back-to-workspace control on a workspace child screen");
  assert.equal(
    back.closest("[data-screen-boundary]") === null,
    true,
    "the breadcrumb renders inside the screen boundary",
  );
});
