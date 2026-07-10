import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { formatAgo, loadFreshness } from "../../src/lib/freshness";

afterEach(() => {
  // fetchLatestCommit caches per-path in sessionStorage; keep tests isolated.
  sessionStorage.clear();
});

const NOW = Date.parse("2026-07-11T12:00:00Z");

test("formatAgo buckets", () => {
  assert.equal(formatAgo(NOW, "2026-07-11T11:59:30Z"), "just now");
  assert.equal(formatAgo(NOW, "2026-07-11T11:48:00Z"), "12 min ago");
  assert.equal(formatAgo(NOW, "2026-07-11T09:00:00Z"), "3 h ago");
  assert.equal(formatAgo(NOW, "2026-07-09T12:00:00Z"), "2 d ago");
  assert.equal(formatAgo(NOW, "2026-06-01T12:00:00Z"), "2026-06-01");
  assert.equal(formatAgo(NOW, "not-a-date"), "");
  // Clock skew (future timestamp) clamps to "just now", never negative.
  assert.equal(formatAgo(NOW, "2026-07-11T12:05:00Z"), "just now");
});

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

function fakeGh(opts: {
  packageJson?: string;
  commitDate?: string;
  failAll?: boolean;
}) {
  let contentCalls = 0;
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        contentCalls += 1;
        if (opts.failAll || opts.packageJson === undefined) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        if (path !== "package.json") throw new Error(`unexpected ${path}`);
        return {
          data: { content: b64(opts.packageJson), encoding: "base64" },
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

test("loadFreshness reads version + last bump date, memoized per instance", async () => {
  const { gh, calls } = fakeGh({
    packageJson: JSON.stringify({ version: "0.34.83" }),
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

test("loadFreshness degrades per-probe and never caches a total failure", async () => {
  const { gh } = fakeGh({ failAll: true });
  const failed = await loadFreshness(gh);
  assert.deepEqual(failed, { version: null, updatedAt: null });
  // Same instance, now healthy: the failed probe must not be pinned.
  const { gh: healthy } = fakeGh({
    packageJson: JSON.stringify({ version: "0.34.84" }),
    commitDate: "2026-07-11T10:00:00Z",
  });
  (gh.repos as any).getContent = healthy.repos.getContent;
  (gh.repos as any).listCommits = healthy.repos.listCommits;
  const recovered = await loadFreshness(gh);
  assert.equal(recovered.version, "0.34.84");
});
