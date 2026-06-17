// Local-file connection extraction — given the CURRENT markdown source
// in the editor (not the vendored corpus), return the list of outgoing
// connections so the Section Inspector can show real data BEFORE the
// author has saved/submitted.
//
// Reuses parseFrontmatter from refGraph (the canonical parser for the
// strict-subset YAML envelope). Domain resolution is delegated to the
// in-memory Taxonomy so unknown refs surface as `domain: null` — the
// inspector renders them as broken / unresolved.

// Import the browser-safe parser directly. refGraph.ts re-exports it
// for legacy callers, but going through refGraph would pull node:fs +
// node:path into the editor's browser bundle (Vite cannot tree-shake
// through the re-export boundary). See parseFrontmatter.ts header.
import { parseFrontmatter } from "./parseFrontmatter";
import type { OutgoingConnection } from "./refGraph";
import type { Taxonomy } from "./taxonomy";

// Frontmatter envelope + inline relatedComponents matchers. parseFrontmatter
// only models the object-ref blocks (a11y/motion/foundations); the flat-array
// relatedComponents field is parsed here so content-file connections
// round-trip in the inspector. Inline-only, mirroring the writer
// (flatRefRewriter) and the documented authoring subset.
const FRONTMATTER_RE = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n/;
const RELATED_LINE_RE = /^relatedComponents:\s*\[([^\]]*)\]\s*$/m;

export function parseLocalFrontmatter(
  source: string,
  taxonomy: Taxonomy,
): OutgoingConnection[] {
  const { frontmatter } = parseFrontmatter(source);
  const out: OutgoingConnection[] = [];
  for (const refType of [
    "a11y_refs",
    "motion_refs",
    "foundations_refs",
  ] as const) {
    for (const item of frontmatter[refType]) {
      out.push({
        slug: item.ref,
        refType,
        note: item.note,
        domain: taxonomy.domainOfSlug(item.ref),
      });
    }
  }

  // relatedComponents (flat-array, content files). Without this the picker is
  // write-only on content files — you can add a related component but it never
  // appears in "Connected topics" and can't be disconnected.
  const fm = source.match(FRONTMATTER_RE);
  const rel = fm ? (fm[1] ?? "").match(RELATED_LINE_RE) : null;
  if (rel) {
    const slugs = (rel[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const slug of slugs) {
      // relatedComponents always points at DS components, so resolve to the
      // "component" domain explicitly when the slug exists there. This also
      // avoids the domainOfSlug resolution-order collision (a slug such as
      // "tabs" exists in BOTH the a11y index and the component corpus) — see
      // buildTaxonomyFromAssets.domainOfSlug. Unresolved → domain null (broken).
      const domain =
        taxonomy.getTitle("component", slug) != null ? "component" : null;
      out.push({ slug, refType: "relatedComponents", note: null, domain });
    }
  }

  return out;
}
