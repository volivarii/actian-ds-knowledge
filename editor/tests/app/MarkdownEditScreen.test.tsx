import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { MarkdownEditScreen } from "../../src/app/MarkdownEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";

function makeFakeOctokit(remoteText: string, remoteSha = "SHA_REMOTE_1") {
  const remoteB64 = Buffer.from(remoteText, "utf-8").toString("base64");
  const calls: Record<string, unknown[]> = { "pulls.create": [] };
  return {
    calls,
    gh: {
      repos: {
        getContent: async () => ({
          data: { content: remoteB64, encoding: "base64", sha: remoteSha },
        }),
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
        create: async (args: unknown) => {
          calls["pulls.create"]!.push(args);
          return { data: { html_url: "https://github.com/x/y/pull/42" } };
        },
      },
    } as any,
  };
}

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

test("MarkdownEditScreen: loads remote and shows file path heading", async () => {
  localStorage.clear();
  const { gh } = makeFakeOctokit("## Hello {#hello}\n");
  render(
    wrap(
      <MarkdownEditScreen
        path="foundations/src/color-primitives.md"
        octokit={gh}
      />,
    ),
  );
  await waitFor(() =>
    assert.ok(screen.getByText("foundations/src/color-primitives.md")),
  );
  cleanup();
});

// The direct "Submit as PR" path was removed (a real incident: using both
// the direct button AND "Add to batch" produced duplicate PRs for one
// edit). Every edit now funnels through the batch/staging cart — this test
// asserts the non-workspace (empty-cart) render has no direct-submit button
// at all, and that "Add to batch" only stages (never opens a PR itself).
test("MarkdownEditScreen: non-workspace render has no direct 'Submit as PR' button; Add to batch only stages", async () => {
  localStorage.clear();
  submissionCartSingleton.clear();
  const { gh, calls } = makeFakeOctokit("## Hello {#hello}\n");
  render(
    wrap(
      <MarkdownEditScreen
        path="foundations/src/color-primitives.md"
        octokit={gh}
      />,
    ),
  );
  const addToBatch = await waitFor(() =>
    screen.getByRole("button", { name: /add to batch/i }),
  );
  assert.equal(
    screen.queryByRole("button", { name: /submit as pr/i }),
    null,
    "the direct 'Submit as PR' button must be removed",
  );
  await act(async () => {
    fireEvent.click(addToBatch);
  });
  assert.equal(
    calls["pulls.create"]!.length,
    0,
    "Add to batch must stage only — it must never open a PR directly",
  );
  submissionCartSingleton.clear();
  cleanup();
});
