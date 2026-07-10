// Live substrate freshness for the header chip: knowledge version +
// when the substrate last changed.
//
// Why runtime-fetched, not baked: editor-deploy.yml only rebuilds the SPA
// on editor/** changes, so a build-time snapshot would silently go stale
// on every content merge.
//
// Oracle: `paths-manifest.json`. Its `knowledge_version` is CI-stamped in
// lockstep with package.json on every derive/sync and the file is never
// hand-edited (write-protected in the editor), so its latest commit IS
// the last substrate change. Deliberately NOT the latest commit on main:
// editor-only merges (e.g. #394, #397) don't touch the manifest, and the
// chip must not claim the knowledge changed when only the tooling did.
// Deliberately NOT package.json: dependency edits touch that file without
// any substrate change.

import type { Octokit } from "@octokit/rest";
import { getTextFile } from "../app/githubApi";
import { fetchLatestCommit } from "./derivedFields";
import { memoizeByInstance } from "./memoizeByInstance";

export interface Freshness {
  /** knowledge_version from paths-manifest.json; null if unreadable. */
  version: string | null;
  /** ISO timestamp of the manifest's last commit; null if unreadable. */
  updatedAt: string | null;
}

const MANIFEST_PATH = "paths-manifest.json";

async function fetchFreshness(gh: Octokit): Promise<Freshness> {
  const [version, commit] = await Promise.all([
    getTextFile(gh, MANIFEST_PATH)
      .then((text) => {
        const parsed = JSON.parse(text) as { knowledge_version?: unknown };
        return typeof parsed.knowledge_version === "string"
          ? parsed.knowledge_version
          : null;
      })
      .catch(() => null),
    fetchLatestCommit(gh, MANIFEST_PATH).catch(() => null),
  ]);
  // `|| null`, not `?? null`: fetchLatestCommit yields date: "" for a
  // commit missing both author and committer dates, and an empty string
  // must not defeat the chip's null guards.
  return { version, updatedAt: commit?.date || null };
}

/** Memoized per Octokit instance; a half-failed probe (either field null)
 *  is retryable rather than pinned for the TTL. */
export const loadFreshness = memoizeByInstance<Octokit, Freshness>(
  fetchFreshness,
  {
    ttlMs: 5 * 60 * 1000,
    isRetryable: (f) => f.version == null || f.updatedAt == null,
  },
);
