import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { MetaEditScreen } from "../../src/app/MetaEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";
import { announce, getAnnouncement } from "../../src/lib/announcer";

function b64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

function fakeGh(files: Record<string, { content: string; sha: string }>) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (!(path in files)) {
          const e: any = new Error("not found");
          e.status = 404;
          throw e;
        }
        const f = files[path]!;
        return {
          data: { encoding: "base64", content: b64(f.content), sha: f.sha },
        };
      },
    },
  } as any;
}

// Minimal schema → only a `label` field renders, so none of the custom
// option-fetching widgets (category/related/a11y) fire during the test.
const SCHEMA = JSON.stringify({
  type: "object",
  properties: { label: { type: "string", title: "Label" } },
});
const META_PATH = "components/src/button/_meta.yml";
const META_SHA = "META_SHA_1";

test("staging a guideline _meta.yml carries the remote blob sha (stale-base detectable)", async () => {
  cleanup();
  submissionCartSingleton.clear();

  const gh = fakeGh({
    "schemas/guideline-meta.json": { content: SCHEMA, sha: "SCHEMA_SHA" },
    [META_PATH]: { content: "label: Button\n", sha: META_SHA },
  });

  render(
    <Theme>
      <MetaEditScreen path={META_PATH} octokit={gh} />
    </Theme>,
  );

  const btn = await waitFor(
    () => screen.getByRole("button", { name: /add to batch/i }),
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(btn);
  });

  const entry = submissionCartSingleton.list().find((e) => e.path === META_PATH);
  assert.ok(entry, "_meta.yml should be staged in the submission cart");
  assert.equal(
    entry!.basedOnSha,
    META_SHA,
    "staged _meta.yml must carry the remote blob sha, not an empty base",
  );

  submissionCartSingleton.clear();
  cleanup();
});

// ── #682: the outcome reaches the reader who is not watching the screen ─────
//
// MetaEditScreen already renders the PR result as a green role="status"
// Callout — that half of #682 was wrong about this screen. What it did not do
// is announce, so a screen-reader user got "Draft saved" for a local write and
// silence for the pull request. SubmissionStaging has announced since it was
// written; this brings the sibling in line.

function fakeGhThatOpensPrs(files: Record<string, { content: string; sha: string }>) {
  const base = fakeGh(files);
  const calls: Record<string, unknown[]> = { "pulls.create": [] };
  base.git = {
    getRef: async () => ({ data: { object: { sha: "BASE_SHA" } } }),
    createRef: async () => ({ data: {} }),
    createBlob: async () => ({ data: { sha: "BLOB" } }),
    createTree: async () => ({ data: { sha: "TREE" } }),
    createCommit: async () => ({ data: { sha: "COMMIT" } }),
    updateRef: async () => ({ data: {} }),
  };
  base.pulls = {
    create: async (args: unknown) => {
      calls["pulls.create"]!.push(args);
      return { data: { html_url: "https://github.com/x/y/pull/7" } };
    },
  };
  return { gh: base, calls };
}

test("MetaEditScreen announces the opened pull request, not only the local save", async () => {
  cleanup();
  submissionCartSingleton.clear();
  announce("");
  // A staged sibling is what puts the screen in the workspace context that
  // offers the direct submit at all.
  submissionCartSingleton.add({
    path: "components/src/button/content.md",
    content: "sibling",
    basedOnSha: "SHA_SIBLING",
    addedAt: Date.now(),
  });

  const { gh, calls } = fakeGhThatOpensPrs({
    "schemas/guideline-meta.json": { content: SCHEMA, sha: "SCHEMA_SHA" },
    [META_PATH]: { content: "label: Button\n", sha: META_SHA },
  });

  render(
    <Theme>
      <MetaEditScreen path={META_PATH} octokit={gh} />
    </Theme>,
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

  await waitFor(
    () => {
      assert.equal(calls["pulls.create"]!.length, 1, "the PR must actually open");
    },
    { timeout: 5000 },
  );
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
  cleanup();
});
