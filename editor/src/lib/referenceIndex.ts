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
import { extractAnchor } from "../app/SectionFocusTracker";
import { scanHeadings, type Heading } from "./headingScan";
import { graphNodes } from "../substrate/taxonomyAssets";
import { splitRawFrontmatter } from "../markdown-engine/rawFrontmatter";

export type { Neighbor };

export interface IncomingRef {
  fromPath: string;
  slug: string;
  snippet: string;
}

export interface SectionAnchor {
  heading: Heading;
  anchor: string | null;
}

// Matches the leading `#{1,3}` + whitespace headingScan/SectionFocusTracker
// both strip before deriving the anchor. Applied only to a heading's own
// line (O(1) per heading), not re-scanned across every line, so this stays
// on the O(headings) side of the single scanHeadings(text) pass below.
const LEADING_HASHES_RE = /^#+\s*/;

/** Anchor for every H1-H3 heading in `text`, in ONE scanHeadings(text) pass
 *  (O(headings), not O(lines) x O(headings) like re-deriving the section per
 *  line). Mirrors computeFocusedSection's rule exactly: only H2/H3 headings
 *  get an anchor (explicit `{#slug}` else derived via the shared
 *  extractAnchor helper); H1 always resolves to null, matching
 *  SectionFocusTracker's H2/H3-only heading list. */
export function sectionAnchors(text: string): SectionAnchor[] {
  const headings = scanHeadings(text);
  const lines = text.split("\n");
  return headings.map((heading) => {
    if (heading.level === 1) return { heading, anchor: null };
    const rawLine = lines[heading.line] ?? "";
    const titleRaw = rawLine.replace(LEADING_HASHES_RE, "").trim();
    return { heading, anchor: extractAnchor(titleRaw) };
  });
}

/** Files that reference any anchor DEFINED in this file, with the
 *  referencing paragraph as a contextual snippet. The slug set is the union
 *  of explicit {#anchor}/bold-paragraph definitions (scanFileForAnchors)
 *  and DERIVED H2/H3 section anchors (sectionAnchors): a section without an
 *  explicit anchor is still a valid reference target (its derived slug is
 *  exactly what countsBySection scopes incoming rows to), so omitting it
 *  here would show a pill count with an empty scoped Incoming list.
 *  Self-references and files whose text is not cached degrade gracefully
 *  (skipped / bare). */
export function incomingForFile(path: string, text: string): IncomingRef[] {
  const out: IncomingRef[] = [];
  const { defines } = scanFileForAnchors(text);
  const derivedAnchors = sectionAnchors(text)
    .map((s) => s.anchor)
    .filter((a): a is string => a !== null);
  const slugs = new Set([...defines, ...derivedAnchors]);
  for (const slug of slugs) {
    for (const fromPath of findReferences(slug)) {
      if (fromPath === path) continue;
      const refText = getCachedText(fromPath);
      // Snippets come from the referencing file's PROSE body: a reference
      // living in its frontmatter (a11y_refs etc.) has no readable paragraph,
      // and extracting from the raw file leaked YAML into the panel.
      const refBody = refText ? splitRawFrontmatter(refText).body : null;
      const snippets = refBody ? snippetsForSlug(refBody, slug) : [];
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
 *  self-exclusion incomingForFile applies); its tests pin the parity.
 *  O(headings) via sectionAnchors' single scanHeadings pass, not the
 *  O(lines) x per-line resection walk this used to run. */
export function countsBySection(
  path: string,
  text: string,
  outgoingCount: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  const seenAnchors = new Set<string>();
  let firstH2Anchor: string | null = null;
  for (const { heading, anchor } of sectionAnchors(text)) {
    if (anchor === null || seenAnchors.has(anchor)) continue;
    seenAnchors.add(anchor);
    if (heading.level === 2 && firstH2Anchor === null) firstH2Anchor = anchor;
    // Excludes only this file's own references to the anchor (e.g. a
    // self-link from within the same section), matching incomingForFile's
    // `fromPath === path` self-exclusion. A different file that also
    // defines the same globally-keyed slug (a co-definer) still counts as
    // a genuine incoming reference.
    const incoming = findReferences(anchor).filter((p) => p !== path).length;
    if (incoming > 0) counts.set(anchor, incoming);
  }
  if (firstH2Anchor && outgoingCount > 0) {
    counts.set(firstH2Anchor, (counts.get(firstH2Anchor) ?? 0) + outgoingCount);
  }
  return counts;
}

export interface ReferenceTarget {
  /** Visible label = node title or heading text. */
  label: string;
  /** Badge: "component" | "section". */
  kind: "component" | "section";
  /** Ready-to-insert link destination: bare slug or "#slug". */
  href: string;
  /** Extra detail line (component category is NOT available on the node; use the slug). */
  detail: string;
}

const COMPONENT_PREFIX = "component:";

/** Picker feed for the [[ reference autocomplete. PR-B grammar law: only
 *  component nodes (bare-slug links) and the CURRENT file's section anchors
 *  (#slug links) have an established body-link grammar; other node types are
 *  panel-only until a grammar decision lands. */
export function searchReferenceTargets(
  query: string,
  currentText: string,
  limit = 8,
): ReferenceTarget[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const scored: Array<{ t: ReferenceTarget; score: number }> = [];
  for (const s of sectionAnchors(currentText)) {
    if (s.anchor === null) continue;
    const hay = s.heading.text.toLowerCase();
    const score = hay.startsWith(q) ? 0 : hay.includes(q) ? 2 : -1;
    if (score < 0) continue;
    scored.push({
      t: {
        label: s.heading.text,
        kind: "section",
        href: "#" + s.anchor,
        detail: s.anchor,
      },
      score,
    });
  }
  for (const n of graphNodes) {
    if (!n.id.startsWith(COMPONENT_PREFIX)) continue;
    const slug = n.id.slice(COMPONENT_PREFIX.length);
    const hay = (n.title + " " + slug).toLowerCase();
    const score = n.title.toLowerCase().startsWith(q)
      ? 1
      : hay.includes(q)
        ? 3
        : -1;
    if (score < 0) continue;
    scored.push({
      t: { label: n.title, kind: "component", href: slug, detail: slug },
      score,
    });
  }
  scored.sort(
    (a, b) => a.score - b.score || a.t.label.localeCompare(b.t.label),
  );
  return scored.slice(0, limit).map((x) => x.t);
}
