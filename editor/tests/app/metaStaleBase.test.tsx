import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { MetaEditScreen } from "../../src/app/MetaEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";

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
