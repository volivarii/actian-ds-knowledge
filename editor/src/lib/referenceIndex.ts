// Section anchors of a document and the [[ reference picker's feed. A
// record's links live in its Connections section (app/connections).
import { extractAnchor } from "../app/SectionFocusTracker";
import { scanHeadings, type Heading } from "./headingScan";
import { graphNodes } from "../substrate/taxonomyAssets";

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
    // `deriveSlug` returns "" for a title with nothing sluggable left:
    // "## ---", "## ***", an emoji-only heading. NOT "## 3." — NUM_PREFIX_RE
    // requires trailing whitespace, so it never fires there and the slug is
    // "3", a perfectly good anchor.
    // The declared type is `string | null` and every caller guards on null, so
    // an "" would slip through as a truthy-looking anchor that is falsy in
    // use. Normalise here, where the type is promised.
    const anchor = extractAnchor(titleRaw);
    return { heading, anchor: anchor ? anchor : null };
  });
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
