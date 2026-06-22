// TDD test for stale-base guard on the MarkdownEditScreen direct-submit path.
//
// The "Submit as PR" button builds filesToSubmit without basedOnSha (bug).
// With the fix, it threads load.remoteSha so detectStaleBase fires when the
// remote has drifted since the editor loaded the file.
import "../setup-dom";
import test from "node:test";
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

function b64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

const REMOTE_TEXT = "## Color {#color}\n\nSome prose.\n";
const FILE_PATH = "foundations/src/color-primitives.md";
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

test("MarkdownEditScreen direct submit: basedOnSha is threaded so stale-base guard fires on a drifted remote", async () => {
  cleanup();
  localStorage.clear();

  const gh = makeStaleFakeGh();

  render(
    <Theme>
      <MarkdownEditScreen path={FILE_PATH} octokit={gh} />
    </Theme>,
  );

  // Wait until the file loads and the Submit button appears.
  await waitFor(() => screen.getByRole("button", { name: /submit as pr/i }), {
    timeout: 5000,
  });

  // Click "Submit as PR" — with the fix this should detect the stale base
  // (remote drifted from REMOTE_SHA to DRIFTED_SHA) and display an error.
  // Without the fix, basedOnSha is absent, the check is skipped, and the
  // submit succeeds silently (no error shown).
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /submit as pr/i }));
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

  cleanup();
});
