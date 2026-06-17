// Map an open editor file path → its knowledge-graph node id (prefix:slug),
// or null if the file does not correspond to a graph node. Browser-safe.
// Mirrors the derive's node-id construction + the path conventions in
// ConnectionsPopover.allowedDomainsFor. Resolution is validated against the
// index, so slug drift / alias mismatches / non-node files degrade gracefully
// (null → caller keeps the anchor-based incoming view) instead of showing a
// ghost panel.
import { bakedGraphIndex, type GraphIndex } from "./graphIndex";

/** Path → candidate `prefix:slug` (no existence check). null if no convention matches. */
export function candidateNodeIdForFile(filePath: string): string | null {
  if (!filePath) return null;
  const p = filePath.replace(/^\.?\/+/, "");
  let m = p.match(/^components\/src\/categories\/([^/]+)\.md$/);
  if (m) return `category:${m[1]!}`;
  m = p.match(/^components\/src\/([^/]+)\//);
  if (m) return `component:${m[1]!}`;
  m = p.match(/^accessibility\/src\/([^/]+)\.md$/);
  if (m) return `a11y:${m[1]!}`;
  m = p.match(/^foundations\/src\/([^/]+)\.md$/);
  if (m) return `foundation:${m[1]!}`;
  m = p.match(/^content\/src\/(?:.*\/)?([^/]+)\.md$/);
  if (m) return `content:${m[1]!}`;
  return null;
}

/** Resolved node id for the file, or null when the file isn't a graph node. */
export function nodeIdForFile(
  filePath: string | undefined,
  index: GraphIndex = bakedGraphIndex(),
): string | null {
  if (!filePath) return null;
  const candidate = candidateNodeIdForFile(filePath);
  if (!candidate) return null;
  return index.node(candidate) ? candidate : null;
}
