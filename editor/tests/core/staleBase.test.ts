import { test } from "node:test";
import assert from "node:assert/strict";
import { detectStaleBase, StaleBaseError } from "../../src/core/staleBase";
import type { FileChange } from "../../src/core/types";

const COORDS = { owner: "o", repo: "r", base: "main" };

function ghReturning(sha: string, text: string) {
  return {
    repos: {
      getContent: async () => ({
        data: {
          sha,
          content: Buffer.from(text, "utf-8").toString("base64"),
          encoding: "base64",
        },
      }),
    },
  };
}
function gh404() {
  return {
    repos: {
      getContent: async () => {
        throw { status: 404 };
      },
    },
  };
}

test("no conflict when basedOnSha matches the remote sha", async () => {
  const files: FileChange[] = [
    { path: "a.md", content: "mine", basedOnSha: "SHA1" },
  ];
  const conflicts = await detectStaleBase(
    files,
    ghReturning("SHA1", "remote") as any,
    COORDS,
  );
  assert.deepEqual(conflicts, []);
});

test("conflict when basedOnSha differs from the remote sha, carrying remote content", async () => {
  const files: FileChange[] = [
    { path: "a.md", content: "mine", basedOnSha: "OLD" },
  ];
  const conflicts = await detectStaleBase(
    files,
    ghReturning("NEW", "their text") as any,
    COORDS,
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.path, "a.md");
  assert.equal(conflicts[0]!.remoteSha, "NEW");
  assert.equal(conflicts[0]!.remoteContent, "their text");
});

test("empty basedOnSha is skipped (new file / reorder stub), never a conflict", async () => {
  const files: FileChange[] = [
    { path: "new.md", content: "mine", basedOnSha: "" },
  ];
  const conflicts = await detectStaleBase(
    files,
    ghReturning("ANY", "x") as any,
    COORDS,
  );
  assert.deepEqual(conflicts, []);
});

test("deleted entries are skipped", async () => {
  const files: FileChange[] = [
    { path: "a.md", content: "", deleted: true, basedOnSha: "OLD" },
  ];
  const conflicts = await detectStaleBase(
    files,
    ghReturning("NEW", "x") as any,
    COORDS,
  );
  assert.deepEqual(conflicts, []);
});

test("404 with a known base sha is a conflict (file deleted remotely)", async () => {
  const files: FileChange[] = [
    { path: "gone.md", content: "mine", basedOnSha: "OLD" },
  ];
  const conflicts = await detectStaleBase(files, gh404() as any, COORDS);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.remoteSha, "");
});

test("StaleBaseError message lists conflicting paths", () => {
  const err = new StaleBaseError([
    { path: "a.md", basedOnSha: "x", remoteSha: "y", remoteContent: "" },
  ]);
  assert.equal(err.name, "StaleBaseError");
  assert.match(err.message, /a\.md/);
});
