// Pure helpers for the <Media role="…" layout="…" /> directive. The directive
// stays raw HTML in the markdown (it round-trips through commonmark unchanged
// and the guard whitelists it); these helpers only drive the rich-mode preview
// and insertion. No serialization behavior depends on them.

export interface MediaAttrs {
  role: string;
  layout?: string;
}

const MEDIA_RE = /^<Media\s+([^>]*?)\s*\/>\s*$/;
const ATTR_RE = /(\w+)="([^"]*)"/g;

export function parseMediaTag(text: string): MediaAttrs | null {
  const m = text.trim().match(MEDIA_RE);
  if (!m || m[1] === undefined) return null;
  const attrs: Record<string, string> = {};
  for (const a of m[1].matchAll(ATTR_RE)) attrs[a[1]!] = a[2]!;
  if (!attrs.role) return null;
  return attrs.layout
    ? { role: attrs.role, layout: attrs.layout }
    : { role: attrs.role };
}

export function resolveMediaSrc(slug: string, role: string): string {
  return `components/dist/media/${slug}/${role}.webp`;
}
