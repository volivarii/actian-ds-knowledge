import type { FileChange } from "./types";

export interface StaleBaseConflict {
  path: string;
  basedOnSha: string;
  remoteSha: string;
  remoteContent: string;
}

export class StaleBaseError extends Error {
  constructor(public readonly conflicts: StaleBaseConflict[]) {
    super(
      `stale base for ${conflicts.length} file${conflicts.length === 1 ? "" : "s"}: ` +
        conflicts.map((c) => c.path).join(", "),
    );
    this.name = "StaleBaseError";
  }
}

/** Cross-env base64 → utf-8 (Node test runtime has Buffer; browser uses atob). */
export function decodeBase64(b64: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64").toString("utf-8");
  }
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * For each non-deleted file with a known base sha, fetch the current remote
 * blob sha on `base` and compare. Returns one conflict per drifted file.
 * Read-only: performs no writes.
 */
export async function detectStaleBase(
  files: FileChange[],
  gh: { repos: { getContent(args: unknown): Promise<{ data: { sha: string; content: string } }> } },
  coords: { owner: string; repo: string; base: string },
): Promise<StaleBaseConflict[]> {
  const conflicts: StaleBaseConflict[] = [];
  for (const file of files) {
    if (file.deleted) continue;
    const expected = file.basedOnSha;
    if (!expected) continue; // unknown base → skip
    try {
      const res = await gh.repos.getContent({
        owner: coords.owner,
        repo: coords.repo,
        path: file.path,
        ref: coords.base,
      });
      const remoteSha = res.data.sha;
      if (remoteSha !== expected) {
        conflicts.push({
          path: file.path,
          basedOnSha: expected,
          remoteSha,
          remoteContent: decodeBase64(res.data.content),
        });
      }
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        conflicts.push({ path: file.path, basedOnSha: expected, remoteSha: "", remoteContent: "" });
        continue;
      }
      throw err;
    }
  }
  return conflicts;
}
