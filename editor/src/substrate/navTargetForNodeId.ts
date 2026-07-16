// Map a knowledge-graph node id (prefix:slug) → the editor nav target that
// opens it (an `activePath` string for App.setActivePath), or null when the
// node has no single recoverable target. Browser-safe (no node:fs; NOT in the
// substrate barrel). The partial INVERSE of nodeIdForFile's path→id rules.
//
// Partial BY DESIGN:
//   component:  → "workspace/<slug>"  (components open as an Authoring
//                 Workspace, not a raw markdown path)
//   category:   → components/src/categories/<slug>.md
//   a11y:       → accessibility/src/<slug>.md
//   foundation: → foundations/src/<slug>.md
//   content:    → null  (the group dir patterns|product|writing is NOT
//                 recoverable from the id alone)
//   motion:     → null  (no standalone editable file convention)
// Unresolved ids degrade to read-only in the panel, mirroring nodeIdForFile.
import type { Domain } from "./taxonomy";

export function navTargetForNodeId(nodeId: string): string | null {
  const i = nodeId.indexOf(":");
  if (i < 0) return null;
  const prefix = nodeId.slice(0, i);
  const slug = nodeId.slice(i + 1);
  if (!slug) return null;
  switch (prefix) {
    case "component":
      return `workspace/${slug}`;
    case "category":
      return `components/src/categories/${slug}.md`;
    case "a11y":
      return `accessibility/src/${slug}.md`;
    case "foundation":
      return `foundations/src/${slug}.md`;
    default:
      return null;
  }
}

/** Nav target for activating a node in the compact rail map, but null for the
 *  map's OWN focus node — the file already open — so activating "you are here"
 *  is a no-op instead of ejecting the author elsewhere. Without this guard a
 *  component's focus node resolves to `workspace/<slug>` (a different screen
 *  than the markdown file being edited), so clicking the center node, or just
 *  pressing Enter on it since it is the default keyboard focus, would navigate
 *  away on the first interaction. */
export function mapNodeNavTarget(
  nodeId: string,
  focusNodeId: string | null,
): string | null {
  if (focusNodeId !== null && nodeId === focusNodeId) return null;
  return navTargetForNodeId(nodeId);
}

// Taxonomy domain (an OutgoingConnection's `domain`) → node-id prefix, so
// outgoing reference rows resolve through the SAME path mapping above
// instead of growing a second one. motion/content stay unmapped for the
// same reasons they are null in navTargetForNodeId; a broken connection
// (domain null) has nowhere to go by definition. Keyed by the Domain
// union so a renamed/added domain is a visible compile-site, not a row
// that silently goes inert.
const DOMAIN_TO_NODE_PREFIX: Partial<Record<Domain, string>> = {
  accessibility: "a11y",
  foundations: "foundation",
  component: "component",
};

export function navTargetForConnection(
  domain: Domain | null,
  slug: string,
): string | null {
  if (!domain || !slug) return null;
  const prefix = DOMAIN_TO_NODE_PREFIX[domain];
  return prefix ? navTargetForNodeId(`${prefix}:${slug}`) : null;
}
