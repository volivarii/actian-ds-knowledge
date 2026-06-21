import { test } from "node:test";
import assert from "node:assert/strict";
import { getTextFileWithSha } from "../../src/app/githubApi";

function b64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

test("getTextFileWithSha: returns decoded UTF-8 text and the blob sha", async () => {
  const gh = {
    repos: {
      getContent: async () => ({
        data: {
          encoding: "base64",
          content: b64("# Héllo — world"),
          sha: "abc123def",
        },
      }),
    },
  } as any;
  const { text, sha } = await getTextFileWithSha(gh, "app-context/src/apps/x.md");
  assert.equal(text, "# Héllo — world");
  assert.equal(sha, "abc123def");
});

test("getTextFileWithSha: throws on a directory listing", async () => {
  const gh = { repos: { getContent: async () => ({ data: [] }) } } as any;
  await assert.rejects(() => getTextFileWithSha(gh, "x/dir"));
});

test("getTextFileWithSha: throws on non-base64 encoding", async () => {
  const gh = {
    repos: {
      getContent: async () => ({
        data: { encoding: "utf-8", content: "zzz", sha: "s" },
      }),
    },
  } as any;
  await assert.rejects(() => getTextFileWithSha(gh, "x/y.md"));
});
