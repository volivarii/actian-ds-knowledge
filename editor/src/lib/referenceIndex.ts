// Read-only composition point for the relations experience: anchor-side
// incoming references (live, from anchorIndex + its text cache) and
// graph-side typed neighbors (baked at editor build; label as such in UI).
import {
  getCachedText,
  findReferences,
  scanFileForAnchors,
} from "./anchorIndex";
import { snippetsForSlug } from "./snippetExtract";
import { bakedGraphIndex, type Neighbor } from "../substrate/graphIndex";
import { nodeIdForFile } from "../substrate/nodeIdForFile";
import { computeFocusedSection } from "../app/SectionFocusTracker";

export type { Neighbor };

export interface IncomingRef {
  fromPath: string;
  slug: string;
  snippet: string;
}

/** Files that reference any anchor DEFINED in this file, with the
 *  referencing paragraph as a contextual snippet. Self-references and
 *  files whose text is not cached degrade gracefully (skipped / bare). */
export function incomingForFile(path: string, text: string): IncomingRef[] {
  const out: IncomingRef[] = [];
  const { defines } = scanFileForAnchors(text);
  for (const slug of new Set(defines)) {
    for (const fromPath of findReferences(slug)) {
      if (fromPath === path) continue;
      const refText = getCachedText(fromPath);
      const snippets = refText ? snippetsForSlug(refText, slug) : [];
      if (snippets.length === 0) {
        out.push({ fromPath, slug, snippet: "" });
      } else {
        for (const snippet of snippets) out.push({ fromPath, slug, snippet });
      }
    }
  }
  return out;
}

/** Typed graph edges touching this file's node, both directions.
 *  Empty when the file resolves to no graph node. */
export function graphNeighborsForFile(path: string): Neighbor[] {
  const id = nodeIdForFile(path);
  if (!id) return [];
  return bakedGraphIndex().neighbors(id, { direction: "both" });
}

/** Per-section connection counts: incoming per defining anchor, plus the
 *  file's outgoing count attached to the first H2 (P8 Option A v1).
 *  Matches the inline memo this hoists out of MarkdownEditScreen, except
 *  this file's own references to an anchor are excluded (the same
 *  self-exclusion incomingForFile applies); its tests pin the parity. */
export function countsBySection(
  path: string,
  text: string,
  outgoingCount: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  const lines = text.split("\n");
  const seenAnchors = new Set<string>();
  let firstH2Anchor: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const s = computeFocusedSection(text, i);
    if (!s || seenAnchors.has(s.anchor)) continue;
    seenAnchors.add(s.anchor);
    if (s.level === 2 && firstH2Anchor === null) firstH2Anchor = s.anchor;
    // Excludes only this file's own references to the anchor (e.g. a
    // self-link from within the same section), matching incomingForFile's
    // `fromPath === path` self-exclusion. A different file that also
    // defines the same globally-keyed slug (a co-definer) still counts as
    // a genuine incoming reference.
    const incoming = findReferences(s.anchor).filter((p) => p !== path).length;
    if (incoming > 0) counts.set(s.anchor, incoming);
  }
  if (firstH2Anchor && outgoingCount > 0) {
    counts.set(firstH2Anchor, (counts.get(firstH2Anchor) ?? 0) + outgoingCount);
  }
  return counts;
}
