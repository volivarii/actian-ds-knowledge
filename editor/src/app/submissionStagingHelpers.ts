// Pure helpers extracted from SubmissionStaging to keep the component
// focused on UI state and to allow direct unit-testing of the resolve path.

import type { CartEntry } from "../drafts/SubmissionCart";
import type { ConflictResolution } from "./ConflictDialog";
import type { FileChange } from "../core/types";

/**
 * Builds the FileChange[] for the stale-resolve re-submit path.
 *
 * For each cart entry: if the conflict resolution map has an entry for that
 * path, use the resolved content + rebased sha; otherwise keep the original
 * cart content.
 *
 * The returned files are submitted with `allowAnchorDrop: false` so that
 * merged/resolved content that drops a heading anchor still triggers the
 * anchor-warning dialog rather than shipping silently.
 */
export function buildResolvedFiles(
  entries: CartEntry[],
  resolved: ConflictResolution[],
): FileChange[] {
  const byPath = new Map(resolved.map((r) => [r.path, r]));
  return entries.map((e) => {
    const r = byPath.get(e.path);
    return r
      ? {
          path: e.path,
          content: r.content,
          basedOnSha: r.basedOnSha,
          deleted: e.deleted,
        }
      : {
          path: e.path,
          content: e.content,
          basedOnSha: e.basedOnSha,
          deleted: e.deleted,
        };
  });
}
