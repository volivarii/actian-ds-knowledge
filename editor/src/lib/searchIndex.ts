// Cross-domain search corpus for the global header. Component/foundation/
// accessibility/app-context come synchronously from the baked graph; content
// comes from the caller (loadContentFiles) since the graph's content:* nodes are
// derived, not src-addressable. Every emitted item carries an openable path.
import {
  graphNodes,
  foundationSections,
  componentNodes,
  a11yIndex,
} from "../substrate/taxonomyAssets";
import { navTargetForNodeId } from "../substrate/navTargetForNodeId";
import type { ContentFile } from "./contentFiles";
import { bodySnippet, type BodyEntry } from "./searchBodies";

export type SearchKind =
  "component" | "foundation" | "content" | "accessibility" | "app-context";

export interface SearchItem {
  title: string;
  kind: SearchKind;
  path: string;
  sub?: string;
  /** Present only on a row matched by its body: the matched phrase in its
   *  sentence. A row the author cannot see the reason for is a row they have
   *  to open to understand. */
  snippet?: string;
}

const KIND_ORDER: SearchKind[] = [
  "component",
  "foundation",
  "content",
  "accessibility",
  "app-context",
];
const APP_SUB: Record<string, string> = {
  app: "Product",
  entity: "Entity",
  pattern: "Pattern",
};

// a11y-index.json sections carry a `tier`. Only "foundation" and "header"
// tiers have a matching file under accessibility/src/<slug>.md, since the
// "component-pattern" and "checklist" tiers are derived from component
// guidelines and have no standalone src file, so a search result for them
// would 404 on open. Confirmed against accessibility/src/ (12 files match
// the 12 foundation+header slugs; the other 20 sections have no file).
const FILE_BACKED_A11Y_TIERS = new Set(["foundation", "header"]);
const fileBackedA11ySlugs = new Set(
  a11yIndex.sections
    .filter((s) => s.tier && FILE_BACKED_A11Y_TIERS.has(s.tier))
    .map((s) => s.slug),
);

export function buildSearchIndex(
  authorable: ReadonlySet<string>,
  contentFiles: readonly ContentFile[] = [],
): SearchItem[] {
  const items: SearchItem[] = [];

  // Components: scope to the AUTHORABLE set (the graph has ~585 component nodes
  // incl. icons/variants; only ~45 are authorable, editable components).
  for (const c of componentNodes) {
    if (!authorable.has(c.slug)) continue;
    const path = navTargetForNodeId(`component:${c.slug}`);
    if (path) items.push({ title: c.title, kind: "component", path });
  }

  // Foundations: top-level sections only (foundationSections already filters out
  // the sub-anchor nodes whose slug contains "/").
  for (const f of foundationSections) {
    const path = navTargetForNodeId(`foundation:${f.slug}`);
    if (path) items.push({ title: f.title, kind: "foundation", path });
  }

  // Accessibility + app-context: file-level graph nodes (skip sub-section nodes,
  // whose slug carries a "/").
  for (const n of graphNodes) {
    const i = n.id.indexOf(":");
    if (i < 0) continue;
    const prefix = n.id.slice(0, i);
    const slug = n.id.slice(i + 1);
    if (!slug || slug.includes("/")) continue;
    if (prefix === "a11y") {
      if (!fileBackedA11ySlugs.has(slug)) continue;
      const path = navTargetForNodeId(n.id);
      if (path) items.push({ title: n.title, kind: "accessibility", path });
    } else if (
      prefix === "app" ||
      prefix === "entity" ||
      prefix === "pattern"
    ) {
      const path = navTargetForNodeId(n.id);
      if (path)
        items.push({
          title: n.title,
          kind: "app-context",
          path,
          sub: APP_SUB[prefix],
        });
    }
  }

  // Content: from the caller's real src listing.
  for (const c of contentFiles) {
    items.push({ title: c.title, kind: "content", path: c.path });
  }

  return items;
}

/** Title-prefix beats title-substring beats body. A body match is still a
 *  match — it is just never the thing the author most likely meant when the
 *  same word is somebody's name. */
const TITLE_PREFIX = 0;
const TITLE_SUBSTRING = 1;
const BODY = 2;

function score(title: string, q: string): number {
  const t = title.toLowerCase();
  return t.startsWith(q) ? TITLE_PREFIX : t.includes(q) ? TITLE_SUBSTRING : -1;
}

export function searchCorpus(
  index: SearchItem[],
  query: string,
  perGroupLimit = 6,
  bodies: readonly BodyEntry[] = [],
): { kind: SearchKind; items: SearchItem[] }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const titleHits = index
    .map((it) => ({ it, s: score(it.title, q) }))
    .filter((x) => x.s >= 0);

  // A document already offered by name does not need a second row for the same
  // words appearing inside it.
  const named = new Set(titleHits.map((x) => x.it.path));
  const bodyHits = bodies
    .filter((b) => !named.has(b.item.path) && b.lower.includes(q))
    .map((b) => ({
      it: { ...b.item, snippet: bodySnippet(b, q) ?? undefined },
      s: BODY,
    }));

  const scored = [...titleHits, ...bodyHits].sort(
    (a, b) => a.s - b.s || a.it.title.localeCompare(b.it.title),
  );
  const byKind = new Map<SearchKind, SearchItem[]>();
  for (const { it } of scored) {
    const arr = byKind.get(it.kind) ?? [];
    if (arr.length < perGroupLimit) arr.push(it);
    byKind.set(it.kind, arr);
  }
  return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
    kind: k,
    items: byKind.get(k)!,
  }));
}
