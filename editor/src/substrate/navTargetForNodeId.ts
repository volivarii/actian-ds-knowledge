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
