// Resolve a markdown link href to a typed substrate reference.
//
// Inline links in the guideline prose point at other substrate entities with a
// bare slug (e.g. `[table](table)`). This turns such an href into a typed
// reference so a renderer can dress it as a chip (type dot + tooltip) instead
// of a cryptic bare slug. Resolution is honest: only a bare slug that names a
// real component node resolves. External URLs, paths, in-doc anchors (`#slug`),
// and unknown slugs return null and stay plain links. Section anchors and other
// node types (foundation, a11y, pattern) are a later slice.
import { graphNodes } from "../substrate/taxonomyAssets";

export interface ResolvedReference {
  slug: string;
  /** Node type, drives the typed color + label. Only "component" today. */
  type: "component";
}

// A component slug is the id after the "component:" prefix. Built once from the
// build-time-baked graph nodes (same corpus the picker and rail already use).
let _componentSlugs: Set<string> | null = null;
function componentSlugs(): Set<string> {
  return (_componentSlugs ??= new Set(
    graphNodes
      .filter((n) => n.id.startsWith("component:"))
      .map((n) => n.id.slice("component:".length)),
  ));
}

// A bare slug: lowercase alphanumeric with hyphens. Excludes anything with a
// scheme, path separator, or `#`, so URLs/paths/anchors never match.
const BARE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Typed reference for a link href, or null if it is not a known reference. */
export function resolveReference(href: string): ResolvedReference | null {
  if (!href || !BARE_SLUG_RE.test(href)) return null;
  if (componentSlugs().has(href)) return { slug: href, type: "component" };
  return null;
}
