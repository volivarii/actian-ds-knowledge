import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResolvedFiles } from "../../src/app/submissionStagingHelpers";
import { droppedAnchors } from "../../src/core/anchorPreservation";
import type { CartEntry } from "../../src/drafts/SubmissionCart";
import type { ConflictResolution } from "../../src/app/ConflictDialog";

// Entry with an anchor-bearing heading in its original content
const BASE_ENTRY: CartEntry = {
  path: "foundations/src/intro.md",
  content: "## Introduction {#introduction}\n\nSome text.",
  basedOnSha: "OLD_SHA",
  deleted: false,
  addedAt: Date.now(),
};

test("buildResolvedFiles — picks resolved content and sha for conflicted file", () => {
  const resolution: ConflictResolution = {
    path: "foundations/src/intro.md",
    content: "Merged content without anchor.",
    basedOnSha: "NEW_SHA",
  };
  const files = buildResolvedFiles([BASE_ENTRY], [resolution]);
  assert.equal(files.length, 1);
  assert.equal(files[0]!.content, "Merged content without anchor.");
  assert.equal(files[0]!.basedOnSha, "NEW_SHA");
});

test("buildResolvedFiles — keeps original entry for non-conflicted file", () => {
  const OTHER_ENTRY: CartEntry = {
    path: "foundations/src/other.md",
    content: "## Other {#other}\n",
    basedOnSha: "SHA1",
    deleted: false,
    addedAt: Date.now(),
  };
  // Resolution only covers intro.md, not other.md
  const resolution: ConflictResolution = {
    path: "foundations/src/intro.md",
    content: "Merged.",
    basedOnSha: "NEW_SHA",
  };
  const files = buildResolvedFiles([BASE_ENTRY, OTHER_ENTRY], [resolution]);
  assert.equal(files[1]!.path, "foundations/src/other.md");
  assert.equal(files[1]!.content, "## Other {#other}\n");
  assert.equal(files[1]!.basedOnSha, "SHA1");
});

test("droppedAnchors — detects anchor drop in merged resolve content (proves anchor-check pipeline catches it)", () => {
  // The remote has an anchor; merged content drops it.
  const remoteContent = "## Introduction {#introduction}\n\nSome text.";
  const mergedContent = "Merged content without the introduction anchor.";
  const dropped = droppedAnchors(remoteContent, mergedContent);
  assert.deepEqual(dropped, ["introduction"]);
});

test("buildResolvedFiles then droppedAnchors — full resolve→anchor-check pipeline detects drop", () => {
  // Simulate: entry has anchor, resolution drops it, droppedAnchors catches it.
  // In the component, runSubmit(files, false) sends these files through
  // submitDraft which calls droppedAnchors. Since allowAnchorDrop=false, an
  // AnchorPreservationError is thrown and caught, setting anchorWarning state.
  const remoteContent = "## Introduction {#introduction}\n\nSome text.";
  const resolution: ConflictResolution = {
    path: "foundations/src/intro.md",
    content: "Merged content without anchor.",
    basedOnSha: "NEW_SHA",
  };
  const files = buildResolvedFiles([BASE_ENTRY], [resolution]);
  const dropped = droppedAnchors(remoteContent, files[0]!.content);
  assert.deepEqual(
    dropped,
    ["introduction"],
    "the anchor-check pipeline (droppedAnchors) correctly detects the dropped anchor from merged/resolved content",
  );
});
