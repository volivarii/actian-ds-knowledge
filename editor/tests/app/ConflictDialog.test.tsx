import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import {
  ConflictDialog,
  type ConflictResolution,
} from "../../src/app/ConflictDialog";

function ghWithBlob(baseText: string) {
  return {
    git: {
      getBlob: async () => ({
        data: {
          content: Buffer.from(baseText, "utf-8").toString("base64"),
          encoding: "base64",
        },
      }),
    },
  };
}

const CONFLICT = {
  path: "foundations/src/intro.md",
  basedOnSha: "OLD",
  remoteSha: "NEW",
  remoteContent: "their text",
};

test("Overwrite resolves with my content rebased on the remote sha", async () => {
  cleanup();
  globalThis.sessionStorage.clear();
  let resolved: ConflictResolution[] | null = null;
  render(
    <Theme>
      <ConflictDialog
        conflicts={[CONFLICT]}
        mineByPath={{ "foundations/src/intro.md": "my text" }}
        octokit={ghWithBlob("base text")}
        owner="o"
        repo="r"
        onResolve={(r) => {
          resolved = r;
        }}
        onCancel={() => {}}
      />
    </Theme>,
  );
  await waitFor(() =>
    assert.ok(screen.queryByText(/foundations\/src\/intro\.md/)),
  );
  fireEvent.click(screen.getByRole("button", { name: /overwrite/i }));
  fireEvent.click(screen.getByRole("button", { name: /submit resolved/i }));
  await waitFor(() => assert.ok(resolved));
  assert.deepEqual(resolved, [
    { path: "foundations/src/intro.md", content: "my text", basedOnSha: "NEW" },
  ]);
  cleanup();
});

test("Reload & reapply with a clean (mine-only) change yields my content", async () => {
  cleanup();
  globalThis.sessionStorage.clear();
  let resolved: ConflictResolution[] | null = null;
  // base == theirs would be clean-take-mine; here base="base text", theirs="their text", mine="my text" → conflict block.
  render(
    <Theme>
      <ConflictDialog
        conflicts={[{ ...CONFLICT, remoteContent: "base text" }]}
        mineByPath={{ "foundations/src/intro.md": "my text" }}
        octokit={ghWithBlob("base text")}
        owner="o"
        repo="r"
        onResolve={(r) => {
          resolved = r;
        }}
        onCancel={() => {}}
      />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.queryByText(/intro\.md/)));
  fireEvent.click(screen.getByRole("button", { name: /reload & reapply/i }));
  fireEvent.click(screen.getByRole("button", { name: /submit resolved/i }));
  await waitFor(() => assert.ok(resolved));
  // theirs == base → clean, take mine
  assert.equal(resolved![0]!.content, "my text");
  assert.equal(resolved![0]!.basedOnSha, "NEW");
  cleanup();
});

test("Cancel calls onCancel", async () => {
  cleanup();
  globalThis.sessionStorage.clear();
  let cancelled = false;
  render(
    <Theme>
      <ConflictDialog
        conflicts={[CONFLICT]}
        mineByPath={{ "foundations/src/intro.md": "my text" }}
        octokit={ghWithBlob("base text")}
        owner="o"
        repo="r"
        onResolve={() => {}}
        onCancel={() => {
          cancelled = true;
        }}
      />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.queryByText(/intro\.md/)));
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
  assert.equal(cancelled, true);
  cleanup();
});
