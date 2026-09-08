import { test, afterEach } from "node:test";
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
import { setWysiwygFlag } from "../helpers/editorSurface";
import {
  getAnnouncement,
  announce as announceForTest,
} from "../../src/lib/announcer";

/** The announcer is a module-level store, so a prior test's message survives
 *  into this one. Reset by announcing a sentinel nobody asserts on. */
function resetAnnouncementsForTest() {
  announceForTest("");
}

// File-level, not inline per test: an inline cleanup() after the last
// assertion is skipped the moment that assertion throws, leaking a mounted
// component into the next test. afterEach runs regardless of the test's
// outcome, so a throw can no longer leak a mount.
afterEach(() => {
  cleanup();
});

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
  setWysiwygFlag("source");
  const { gh } = makeFakeOctokit("## Hello {#hello}\n");
  render(
    wrap(
      <MarkdownEditScreen
        path="foundations/src/color-primitives.md"
        octokit={gh}
      />,
    ),
  );
  await waitFor(
    () => assert.ok(screen.getByText("foundations/src/color-primitives.md")),
    { timeout: 5000 },
  );
  // The path is the screen's ONE h1 (the shell adds none; that is tested on
  // the shell). Radix Heading defaults to h1, so this checks the level was
  // chosen, not inherited.
  const h1s = document.querySelectorAll("h1");
  assert.equal(h1s.length, 1, `h1s: ${[...h1s].map((h) => h.textContent).join(" | ")}`);
});

// The direct "Submit as PR" path was removed (a real incident: using both
// the direct button AND "Add to batch" produced duplicate PRs for one
// edit). Every edit now funnels through the batch/staging cart — this test
// asserts the non-workspace (empty-cart) render has no direct-submit button
// at all, and that "Add to batch" only stages (never opens a PR itself).
test("MarkdownEditScreen: non-workspace render has no direct 'Submit as PR' button; Add to batch only stages", async () => {
  setWysiwygFlag("source");
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
  const addToBatch = await waitFor(
    () => screen.getByRole("button", { name: /add to batch/i }),
    { timeout: 5000 },
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
});

// ── #682: the outcome the editor exists to produce ──────────────────────────
//
// A load failure escalates to an alert Callout. The pull request — the one
// irreversible, outward-facing act — rendered as plain <Text> inside the button
// row, and reached the live region not at all. An author who sees no change
// clicks again, which is how #270/#271 became byte-identical PRs seven seconds
// apart. Its siblings already do this right: MetaEditScreen renders a green
// Callout, SubmissionStaging both renders one and announces.

async function submitOnlyThisFile() {
  setWysiwygFlag("source");
  submissionCartSingleton.clear();
  // A staged sibling puts the screen in workspace context, which is the only
  // render that offers the direct submit at all.
  submissionCartSingleton.add({
    path: "components/src/button/usage.md",
    content: "sibling",
    basedOnSha: "SHA_SIBLING",
    addedAt: Date.now(),
  });
  const { gh, calls } = makeFakeOctokit("## Hello {#hello}\n");
  render(
    wrap(<MarkdownEditScreen path="components/src/button/content.md" octokit={gh} />),
  );
  const submit = await waitFor(
    () => screen.getByRole("button", { name: /submit only this file/i }),
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(submit);
  });
  const confirm = await waitFor(
    () => screen.getByRole("button", { name: /yes, submit only this file/i }),
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(confirm);
  });
  await waitFor(() => {
    assert.equal(calls["pulls.create"]!.length, 1);
  }, { timeout: 5000 });
  return { calls };
}

test("MarkdownEditScreen: an opened pull request is raised to a status Callout, not inline body text", async () => {
  await submitOnlyThisFile();
  // This screen renders more than one role="status" (the anchor-rename
  // notice is another), so pin the assertion to the one carrying the PR url
  // rather than to whichever comes first in the document.
  await waitFor(
    () => {
      const withUrl = Array.from(
        document.querySelectorAll('[role="status"]'),
      ).filter((el) =>
        /https:\/\/github\.com\/x\/y\/pull\/42/.test(el.textContent ?? ""),
      );
      assert.equal(
        withUrl.length,
        1,
        `exactly one role=status must carry the PR url; found ${withUrl.length}. ` +
          `All status regions: ${JSON.stringify(
            Array.from(document.querySelectorAll('[role="status"]')).map(
              (e) => e.textContent,
            ),
          )}`,
      );
    },
    { timeout: 5000 },
  );
  submissionCartSingleton.clear();
});

test("MarkdownEditScreen: an opened pull request is announced in the live region", async () => {
  resetAnnouncementsForTest();
  await submitOnlyThisFile();
  await waitFor(
    () => {
      assert.equal(
        getAnnouncement().text,
        "Pull request opened",
        `the live region said: ${JSON.stringify(getAnnouncement().text)}`,
      );
    },
    { timeout: 5000 },
  );
  submissionCartSingleton.clear();
});
