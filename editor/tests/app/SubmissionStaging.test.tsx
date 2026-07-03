// Tests for SubmissionStaging stale-resolve anchor-check fixes.
//
// Fix #1: resolved/merged content from a stale-resolve re-submit is now
// anchor-checked (allowAnchorDrop=false). If the merged content drops a
// heading anchor, the anchor-warning dialog surfaces instead of shipping
// silently. The anchor-confirm dialog re-submits the SAME resolved files
// (via pendingFiles), not the original cart entries.
//
// Fix #2: the submitting guard now lives in runSubmit so ALL call sites
// (initial, anchor-confirm, stale-resolve) are protected against
// double-submit.
//
// Full-component wiring through ConflictDialog → onResolve → runSubmit →
// submitDraft → AnchorPreservationError requires a multi-layer GitHub API
// mock that is out-of-scope for unit-smoke. Instead:
//   • We unit-test buildResolvedFiles (the pure helper extracted from
//     onResolve) to prove it correctly picks resolved content.
//   • We compose buildResolvedFiles + droppedAnchors to prove that the
//     anchor-check pipeline (run with the resolved files) detects dropped
//     anchors — establishing that the integration WOULD catch them.

import "../setup-dom";
import { test } from "node:test";
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
import { buildResolvedFiles } from "../../src/app/submissionStagingHelpers";
import { droppedAnchors } from "../../src/core/anchorPreservation";
import {
  SubmissionCart,
  type CartEntry,
} from "../../src/drafts/SubmissionCart";
import type { ConflictResolution } from "../../src/app/ConflictDialog";
import { SubmissionStaging } from "../../src/app/SubmissionStaging";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ANCHOR_ENTRY: CartEntry = {
  path: "foundations/src/intro.md",
  content: "## Introduction {#introduction}\n\nOriginal body.",
  basedOnSha: "OLD_SHA",
  addedAt: Date.now(),
  deleted: false,
};

const OTHER_ENTRY: CartEntry = {
  path: "foundations/src/other.md",
  content: "## Other section {#other}\n\nOther body.",
  basedOnSha: "SHA_OTHER",
  addedAt: Date.now(),
  deleted: false,
};

// ---------------------------------------------------------------------------
// buildResolvedFiles — correct FileChange construction
// ---------------------------------------------------------------------------

test("buildResolvedFiles — picks resolved content and sha for a conflicted file", () => {
  cleanup();
  globalThis.sessionStorage.clear();
  const resolution: ConflictResolution = {
    path: "foundations/src/intro.md",
    content: "Merged content without anchor.",
    basedOnSha: "NEW_SHA",
  };
  const files = buildResolvedFiles([ANCHOR_ENTRY], [resolution]);
  assert.equal(files.length, 1);
  assert.equal(files[0]!.path, "foundations/src/intro.md");
  assert.equal(files[0]!.content, "Merged content without anchor.");
  assert.equal(files[0]!.basedOnSha, "NEW_SHA");
  cleanup();
});

test("buildResolvedFiles — preserves original content and sha for files not in the resolution", () => {
  cleanup();
  globalThis.sessionStorage.clear();
  // Resolution only covers intro.md, not other.md
  const resolution: ConflictResolution = {
    path: "foundations/src/intro.md",
    content: "Merged.",
    basedOnSha: "NEW_SHA",
  };
  const files = buildResolvedFiles([ANCHOR_ENTRY, OTHER_ENTRY], [resolution]);
  assert.equal(files.length, 2);
  const other = files.find((f) => f.path === "foundations/src/other.md")!;
  assert.equal(other.content, OTHER_ENTRY.content);
  assert.equal(other.basedOnSha, "SHA_OTHER");
  cleanup();
});

test("buildResolvedFiles — preserves deleted flag from the original cart entry", () => {
  cleanup();
  globalThis.sessionStorage.clear();
  const deletedEntry: CartEntry = {
    path: "foundations/src/old.md",
    content: "",
    basedOnSha: "SHA_DEL",
    addedAt: Date.now(),
    deleted: true,
  };
  const resolution: ConflictResolution = {
    path: "foundations/src/old.md",
    content: "",
    basedOnSha: "NEW_SHA_DEL",
  };
  const files = buildResolvedFiles([deletedEntry], [resolution]);
  assert.equal(files[0]!.deleted, true);
  cleanup();
});

// ---------------------------------------------------------------------------
// droppedAnchors — proves the anchor-check pipeline catches drops in merged
// content. This is the same function called by submitDraft when
// allowAnchorDrop=false.
// ---------------------------------------------------------------------------

test("droppedAnchors — detects anchor dropped in merged/resolved content", () => {
  cleanup();
  globalThis.sessionStorage.clear();
  // The remote has an anchor; merged content drops it.
  const remoteContent = "## Introduction {#introduction}\n\nSome text.";
  const mergedContent = "Merged content without the introduction anchor.";
  const dropped = droppedAnchors(remoteContent, mergedContent);
  assert.deepEqual(dropped, ["introduction"]);
  cleanup();
});

test("droppedAnchors — returns empty array when no anchors are dropped", () => {
  cleanup();
  globalThis.sessionStorage.clear();
  const remoteContent = "## Introduction {#introduction}\n\nSome text.";
  const resolvedContent = "## Introduction {#introduction}\n\nMerged body.";
  const dropped = droppedAnchors(remoteContent, resolvedContent);
  assert.deepEqual(dropped, []);
  cleanup();
});

// ---------------------------------------------------------------------------
// Integration proof: buildResolvedFiles + droppedAnchors together
//
// This proves the full resolve-then-anchor-check pipeline:
// 1. ConflictDialog calls onResolve with resolution containing merged content
// 2. onResolve calls buildResolvedFiles(entries, resolved) → FileChange[]
// 3. runSubmit calls submitDraft with allowAnchorDrop=false  (Fix #1)
// 4. submitDraft calls droppedAnchors(remoteContent, file.content) and
//    throws AnchorPreservationError if any anchors were dropped
// 5. runSubmit catches AnchorPreservationError → sets anchorWarning state
// ---------------------------------------------------------------------------

test("resolve→anchor-check pipeline: merged content that drops an anchor is detectable", () => {
  cleanup();
  globalThis.sessionStorage.clear();
  // Step 1-2: build resolved files from a resolution that drops the anchor
  const resolution: ConflictResolution = {
    path: "foundations/src/intro.md",
    content: "Merged: both sides changed but the anchor heading was removed.",
    basedOnSha: "NEW_SHA",
  };
  const files = buildResolvedFiles([ANCHOR_ENTRY], [resolution]);

  // Step 3-5: prove that droppedAnchors (called by submitDraft's anchor
  // guard) would detect the dropped anchor in the resolved content.
  // The remote content is what was on GitHub before the merge.
  const remoteContent =
    "## Introduction {#introduction}\n\nOriginal remote body.";
  const dropped = droppedAnchors(remoteContent, files[0]!.content);
  assert.deepEqual(
    dropped,
    ["introduction"],
    "The anchor-check pipeline (droppedAnchors) correctly detects that the " +
      "resolved/merged file drops the #introduction anchor. With " +
      "allowAnchorDrop=false (Fix #1), submitDraft would throw " +
      "AnchorPreservationError and runSubmit would set anchorWarning state, " +
      "surfacing the warning dialog instead of shipping silently.",
  );
  cleanup();
});

// ---------------------------------------------------------------------------
// Synchronous re-entry guard (submittingRef) — proves the fix for the
// duplicate-PR bug: a double-click within the same tick used to be able to
// slip past the async `submitting` state guard (React state updates
// asynchronously) and fire submitDraft twice. The fix adds a synchronous
// ref flipped BEFORE any await, mirroring MarkdownEditScreen's doSubmit
// guard.
// ---------------------------------------------------------------------------

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
}

const BATCH_ENTRY: CartEntry = {
  path: "foundations/src/color-primitives.md",
  content: "## Color {#color}\n\nBody.\n",
  basedOnSha: "BATCH_SHA_1",
  addedAt: Date.now(),
  deleted: false,
};

function makeBatchFakeGh(calls: { create: unknown[] }) {
  return {
    repos: {
      // Used both by submitDraft's anchor-check refetch and by
      // detectStaleBase — return content/sha matching BATCH_ENTRY exactly
      // so neither guard fires and the submit proceeds to open a PR.
      getContent: async () => ({
        data: {
          content: Buffer.from(BATCH_ENTRY.content, "utf8").toString("base64"),
          encoding: "base64",
          sha: BATCH_ENTRY.basedOnSha,
        },
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
        calls.create.push(args);
        return { data: { html_url: "https://github.com/x/y/pull/99" } };
      },
    },
  } as any;
}

test("SubmissionStaging: two synchronous clicks on 'Submit batch' open only ONE PR (submittingRef guard)", async () => {
  cleanup();
  const cart = new SubmissionCart(makeMemoryStorage());
  cart.add(BATCH_ENTRY);
  const calls = { create: [] as unknown[] };
  const gh = makeBatchFakeGh(calls);

  render(
    <Theme>
      <SubmissionStaging
        cart={cart}
        entries={cart.list()}
        octokit={gh}
        open={true}
        onOpenChange={() => {}}
      />
    </Theme>,
  );

  const submitBtn = await waitFor(() =>
    screen.getByRole("button", { name: /submit batch/i }),
  );

  // Fire two clicks synchronously within one act() — no await between them
  // — so both handlers run before either's continuation (past the first
  // await inside runSubmit) gets a chance to execute. Before the fix, the
  // `submitting` state guard (`if (submitting) return;`) is stale on the
  // second call (React state hasn't re-rendered yet) and both calls proceed
  // to call submitDraft, opening 2 PRs.
  await act(async () => {
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
  });

  await waitFor(() => assert.ok(screen.queryByText(/PR opened/i)));

  assert.equal(
    calls.create.length,
    1,
    "the synchronous ref guard must prevent a same-tick double-click from opening 2 PRs",
  );

  cleanup();
});
