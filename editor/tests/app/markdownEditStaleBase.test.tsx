// TDD test for stale-base guard on the MarkdownEditScreen submit path.
//
// doSubmit builds filesToSubmit with basedOnSha threaded from `load`, so
// detectStaleBase fires when the remote has drifted since the editor loaded
// the file. doSubmit is exercised here via the workspace "Submit only this
// file…" escape hatch — the direct "Submit as PR" button was removed (fix
// for the duplicate-PR bug: every edit now funnels through the batch, and
// the escape hatch is the sole surviving single-file submit path). The
// workspace escape hatch only renders when a sibling file for the same
// component is staged in the cart (inWorkspaceContext), so each test below
// pre-stages a sibling before rendering.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { MarkdownEditScreen } from "../../src/app/MarkdownEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";

// File-level, not inline per test: an inline cleanup() after the last
// assertion is skipped the moment that assertion throws, leaking a mounted
// component into the next test. afterEach runs regardless of the test's
// outcome, so a throw can no longer leak a mount.
afterEach(() => {
  cleanup();
});

function b64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

const REMOTE_TEXT = "## Color {#color}\n\nSome prose.\n";
const FILE_PATH = "components/src/button/guidelines.md";
const SIBLING_PATH = "components/src/button/_meta.yml";
const REMOTE_SHA = "MARKDOWN_SHA_1";
const DRIFTED_SHA = "MARKDOWN_SHA_2_DRIFTED";

/**
 * A path-aware fake octokit: for all paths OTHER THAN FILE_PATH, returns a
 * dummy response. For FILE_PATH, the first call (file load) returns
 * REMOTE_SHA; all subsequent calls (detectStaleBase during submit) return
 * DRIFTED_SHA, simulating a concurrent remote edit.
 *
 * This avoids coupling the mock to anchorIndex.ts preloads which also issue
 * getContent for many other paths before the submit fires.
 */
function makeStaleFakeGh() {
  let filePathCallCount = 0;
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === FILE_PATH) {
          filePathCallCount += 1;
          const sha = filePathCallCount === 1 ? REMOTE_SHA : DRIFTED_SHA;
          return {
            data: {
              content: b64(REMOTE_TEXT),
              encoding: "base64",
              sha,
            },
          };
        }
        // Any other path (anchorIndex preloads, etc.): 404
        const e: any = new Error("not found");
        e.status = 404;
        throw e;
      },
    },
    git: {
      getRef: async () => ({ data: { object: { sha: "BASE_SHA" } } }),
      createRef: async () => ({ data: {} }),
      createBlob: async () => ({ data: { sha: "BLOB" } }),
      createTree: async () => ({ data: { sha: "TREE" } }),
      createCommit: async () => ({ data: { sha: "COMMIT" } }),
      updateRef: async () => ({ data: {} }),
    },
    pulls: {
      create: async () => ({
        data: { html_url: "https://github.com/x/y/pull/1" },
      }),
    },
  } as any;
}

test("MarkdownEditScreen workspace escape hatch: basedOnSha is threaded so stale-base guard fires on a drifted remote", async () => {
  localStorage.clear();
  submissionCartSingleton.clear();

  // Stage a sibling file for the same component so the workspace escape
  // hatch ("Submit only this file…") renders (inWorkspaceContext requires
  // siblingStaged > 0).
  submissionCartSingleton.add({
    path: SIBLING_PATH,
    content: 'component: "button"\n',
    basedOnSha: "META_SHA_1",
    addedAt: Date.now(),
  });

  const gh = makeStaleFakeGh();

  render(
    <Theme>
      <MarkdownEditScreen path={FILE_PATH} octokit={gh} />
    </Theme>,
  );

  // Wait until the file loads and the workspace escape hatch appears.
  const trigger = await waitFor(
    () => screen.getByRole("button", { name: /^submit only this file/i }),
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(trigger);
  });

  // Confirm the orphan-submit AlertDialog — this is what actually calls
  // doSubmit(false).
  const confirm = await waitFor(
    () => screen.getByRole("button", { name: /^yes, submit only this file/i }),
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(confirm);
  });

  // With the fix: the StaleBaseError message ("stale base for 1 file: ...")
  // is caught and rendered as submitError (red text). Without the fix,
  // basedOnSha is absent so the stale-base check is skipped (line 45 of
  // staleBase.ts: `if (!expected) continue`) and the submit succeeds.
  await waitFor(
    () => {
      const body = document.body.textContent ?? "";
      assert.ok(
        body.includes("stale base"),
        `Expected "stale base" error in UI but got: "${body.slice(0, 400)}"`,
      );
    },
    { timeout: 5000 },
  );

  submissionCartSingleton.clear();
});

// ─── Fix #1: cart-source stale-base test ────────────────────────────────────
//
// When a file is loaded from the cart (a previously staged edit), the
// MarkdownEditScreen sets load.source = "cart" and load.remoteSha =
// cartHit.basedOnSha. But the old filesToSubmit code only threaded basedOnSha
// when load.source === "remote" — so cart-loaded files had no stale-base
// protection. The fix changes the condition to load.source !== "stub".
//
// This test pre-populates the cart with the active file (so it loads with
// source="cart") PLUS a sibling file for the same component (so the
// workspace escape hatch renders), then confirms that triggering doSubmit
// via "Submit only this file…" hits the stale-base guard (the remote
// returns a DIFFERENT sha during the detectStaleBase check).
test("MarkdownEditScreen cart-source workspace escape hatch: basedOnSha threaded so stale-base guard fires", async () => {
  localStorage.clear();
  submissionCartSingleton.clear();

  const CART_PATH = "components/src/button/guidelines.md";
  const SIBLING_PATH2 = "components/src/button/_meta.yml";
  const CART_SHA = "CART_SHA_1";
  const DRIFTED_SHA2 = "CART_SHA_2_DRIFTED";
  const CART_TEXT = "## Color {#color}\n\nCart prose.\n";

  // Pre-load the cart with the active file (known SHA) AND a sibling so
  // the workspace escape hatch renders.
  submissionCartSingleton.add({
    path: CART_PATH,
    content: CART_TEXT,
    basedOnSha: CART_SHA,
    addedAt: Date.now(),
  });
  submissionCartSingleton.add({
    path: SIBLING_PATH2,
    content: 'component: "button"\n',
    basedOnSha: "META_SHA_1",
    addedAt: Date.now(),
  });

  // The octokit fake: getContent for CART_PATH returns a drifted SHA to
  // simulate a concurrent remote edit. The screen will load from the cart
  // (not from the remote), but detectStaleBase will call getContent and
  // discover the drift. Any other path gets a 404.
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === CART_PATH) {
          return {
            data: {
              content: Buffer.from(CART_TEXT, "utf8").toString("base64"),
              encoding: "base64",
              sha: DRIFTED_SHA2,
            },
          };
        }
        const e: any = new Error("not found");
        e.status = 404;
        throw e;
      },
    },
    git: {
      getRef: async () => ({ data: { object: { sha: "BASE_SHA" } } }),
      createRef: async () => ({ data: {} }),
      createBlob: async () => ({ data: { sha: "BLOB" } }),
      createTree: async () => ({ data: { sha: "TREE" } }),
      createCommit: async () => ({ data: { sha: "COMMIT" } }),
      updateRef: async () => ({ data: {} }),
    },
    pulls: {
      create: async () => ({
        data: { html_url: "https://github.com/x/y/pull/1" },
      }),
    },
  } as any;

  render(
    <Theme>
      <MarkdownEditScreen path={CART_PATH} octokit={gh} />
    </Theme>,
  );

  // Wait until the cart-loaded file renders and the workspace escape hatch
  // appears.
  const trigger = await waitFor(
    () => screen.getByRole("button", { name: /^submit only this file/i }),
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(trigger);
  });

  const confirm = await waitFor(
    () => screen.getByRole("button", { name: /^yes, submit only this file/i }),
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(confirm);
  });

  // With the fix, basedOnSha = CART_SHA_1 is threaded, so detectStaleBase
  // detects the drift (remote now returns CART_SHA_2_DRIFTED) and surfaces
  // "stale base" in the error. Without the fix, basedOnSha is undefined for
  // cart-source files, the check is skipped, and submit succeeds.
  await waitFor(
    () => {
      const body = document.body.textContent ?? "";
      assert.ok(
        body.includes("stale base"),
        `Expected "stale base" error in UI but got: "${body.slice(0, 400)}"`,
      );
    },
    { timeout: 5000 },
  );

  submissionCartSingleton.clear();
});
