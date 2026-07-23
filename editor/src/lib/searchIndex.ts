// Cross-domain search corpus for the global header. Component/foundation/
// accessibility/app-context come synchronously from the baked graph; content
// comes from the caller (loadContentFiles) since the graph's content:* nodes are
// derived, not src-addressable. Every emitted item carries an openable path.
import {
  graphNodes,
  foundationSections,
  componentNodes,
} from "../substrate/taxonomyAssets";
import { navTargetForNodeId } from "../substrate/navTargetForNodeId";
import type { ContentFile } from "./contentFiles";

export type SearchKind =
  | "component" | "foundation" | "content" | "accessibility" | "app-context";

export interface SearchItem {
  title: string;
  kind: SearchKind;
  path: string;
  sub?: string;
}

const KIND_ORDER: SearchKind[] = [
  "component", "foundation", "content", "accessibility", "app-context",
];
const APP_SUB: Record<string, string> = {
  app: "Product", entity: "Entity", pattern: "Feature",
};

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
      const path = navTargetForNodeId(n.id);
      if (path) items.push({ title: n.title, kind: "accessibility", path });
    } else if (prefix === "app" || prefix === "entity" || prefix === "pattern") {
      const path = navTargetForNodeId(n.id);
      if (path) items.push({ title: n.title, kind: "app-context", path, sub: APP_SUB[prefix] });
    }
  }

  // Content: from the caller's real src listing.
  for (const c of contentFiles) {
    items.push({ title: c.title, kind: "content", path: c.path });
  }

  return items;
}

function score(title: string, q: string): number {
  const t = title.toLowerCase();
  return t.startsWith(q) ? 0 : t.includes(q) ? 1 : -1;
}

export function searchCorpus(
  index: SearchItem[],
  query: string,
  perGroupLimit = 6,
): { kind: SearchKind; items: SearchItem[] }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = index
    .map((it) => ({ it, s: score(it.title, q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.it.title.localeCompare(b.it.title));
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
