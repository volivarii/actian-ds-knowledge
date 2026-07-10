// Live substrate freshness for the header chip: knowledge version +
// when the substrate last changed.
//
// Why runtime-fetched, not baked: editor-deploy.yml only rebuilds the SPA
// on editor/** changes, so a build-time snapshot of package.json#version
// would silently go stale on every content merge. CI bumps
// package.json#version in lockstep on every derive/sync, so its latest
// commit date doubles as "when the substrate last changed".
//
// Reuses fetchLatestCommit (sessionStorage, 5-min TTL) for the date and
// memoizes the combined result per Octokit instance like loadCoverage.

import type { Octokit } from "@octokit/rest";
import { getTextFile } from "../app/githubApi";
import { fetchLatestCommit } from "./derivedFields";

export interface Freshness {
  /** knowledge version from package.json, e.g. "0.34.83"; null if unreadable. */
  version: string | null;
  /** ISO timestamp of the last version-bump commit; null if unreadable. */
  updatedAt: string | null;
}

const FRESHNESS_TTL_MS = 5 * 60 * 1000;
const freshnessCache = new WeakMap<
  Octokit,
  { at: number; promise: Promise<Freshness> }
>();

export function loadFreshness(gh: Octokit): Promise<Freshness> {
  const hit = freshnessCache.get(gh);
  if (hit && Date.now() - hit.at < FRESHNESS_TTL_MS) return hit.promise;
  const promise = fetchFreshness(gh);
  freshnessCache.set(gh, { at: Date.now(), promise });
  promise.then(
    (f) => {
      // Never pin a fully failed probe; retry on the next call.
      if (
        f.version == null &&
        f.updatedAt == null &&
        freshnessCache.get(gh)?.promise === promise
      ) {
        freshnessCache.delete(gh);
      }
    },
    () => {
      if (freshnessCache.get(gh)?.promise === promise) {
        freshnessCache.delete(gh);
      }
    },
  );
  return promise;
}

async function fetchFreshness(gh: Octokit): Promise<Freshness> {
  const [version, commit] = await Promise.all([
    getTextFile(gh, "package.json")
      .then((text) => {
        const parsed = JSON.parse(text) as { version?: unknown };
        return typeof parsed.version === "string" ? parsed.version : null;
      })
      .catch(() => null),
    fetchLatestCommit(gh, "package.json").catch(() => null),
  ]);
  return { version, updatedAt: commit?.date ?? null };
}

/** "just now" / "12 min ago" / "3 h ago" / "2 d ago" / "2026-06-01".
 *  Takes `now` explicitly so tests stay deterministic. */
export function formatAgo(nowMs: number, iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const deltaS = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (deltaS < 60) return "just now";
  const deltaMin = Math.floor(deltaS / 60);
  if (deltaMin < 60) return `${deltaMin} min ago`;
  const deltaH = Math.floor(deltaMin / 60);
  if (deltaH < 24) return `${deltaH} h ago`;
  const deltaD = Math.floor(deltaH / 24);
  if (deltaD < 14) return `${deltaD} d ago`;
  return iso.slice(0, 10);
}
