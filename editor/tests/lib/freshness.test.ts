import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { loadFreshness } from "../../src/lib/freshness";

afterEach(() => {
  // fetchLatestCommit caches per-path in sessionStorage; keep tests isolated.
  sessionStorage.clear();
});

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

function fakeGh(opts: {
  knowledgeVersion?: string;
  commitDate?: string;
  failAll?: boolean;
}) {
  let contentCalls = 0;
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        contentCalls += 1;
        if (opts.failAll || opts.knowledgeVersion === undefined) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        if (path !== "paths-manifest.json") throw new Error(`unexpected ${path}`);
        return {
          data: {
            content: b64(
              JSON.stringify({ knowledge_version: opts.knowledgeVersion }),
            ),
            encoding: "base64",
          },
        };
      },
      listCommits: async () => {
        if (opts.failAll || opts.commitDate === undefined)
          throw new Error("boom");
        return {
          data: [
            {
              author: { login: "actian-ds-bot" },
              commit: { author: { date: opts.commitDate } },
            },
          ],
        };
      },
    },
  } as any;
  return { gh, calls: () => contentCalls };
}

test("loadFreshness reads knowledge_version + manifest commit date, memoized", async () => {
  const { gh, calls } = fakeGh({
    knowledgeVersion: "0.34.83",
    commitDate: "2026-07-11T09:00:00Z",
  });
  const first = await loadFreshness(gh);
  assert.deepEqual(first, {
    version: "0.34.83",
    updatedAt: "2026-07-11T09:00:00Z",
  });
  await loadFreshness(gh);
  assert.equal(calls(), 1, "second call should hit the memo, not the API");
});

test("loadFreshness never pins a total failure", async () => {
  const { gh } = fakeGh({ failAll: true });
  const failed = await loadFreshness(gh);
  assert.deepEqual(failed, { version: null, updatedAt: null });
  const { gh: healthy } = fakeGh({
    knowledgeVersion: "0.34.84",
    commitDate: "2026-07-11T10:00:00Z",
  });
  (gh.repos as any).getContent = healthy.repos.getContent;
  (gh.repos as any).listCommits = healthy.repos.listCommits;
  const recovered = await loadFreshness(gh);
  assert.equal(recovered.version, "0.34.84");
});

test("loadFreshness retries a half-failed probe instead of pinning it", async () => {
  // Version resolves, commit probe fails → result is retryable.
  const { gh } = fakeGh({ knowledgeVersion: "0.34.83" });
  const partial = await loadFreshness(gh);
  assert.deepEqual(partial, { version: "0.34.83", updatedAt: null });
  sessionStorage.clear(); // drop fetchLatestCommit's negative cache too
  const { gh: healthy } = fakeGh({
    knowledgeVersion: "0.34.83",
    commitDate: "2026-07-11T11:00:00Z",
  });
  (gh.repos as any).getContent = healthy.repos.getContent;
  (gh.repos as any).listCommits = healthy.repos.listCommits;
  const full = await loadFreshness(gh);
  assert.equal(full.updatedAt, "2026-07-11T11:00:00Z");
});

test("an empty commit date string is normalized to null, keeping the chip's guards sound", async () => {
  const { gh } = fakeGh({ knowledgeVersion: "0.34.83", commitDate: "" });
  const result = await loadFreshness(gh);
  // fetchLatestCommit yields date: "" when the commit has no dates;
  // freshness must not let "" leak past the null guards.
  assert.equal(result.updatedAt, null);
});
