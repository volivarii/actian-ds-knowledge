// Pure contextual-snippet extraction for the RelationsPanel: per the
// verified research (Matuschak), a backlink is useful when it shows the
// referencing PARAGRAPH, not just the source title.

const FENCED_CODE_RE = /(?:```|~~~)[\s\S]*?(?:```|~~~)/g;
const MAX_SNIPPET = 240;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** All blank-line-delimited paragraphs of `text` (fenced code stripped),
 *  each with its raw block text preserved for matching. */
function paragraphs(text: string): string[] {
  const stripped = text.replace(FENCED_CODE_RE, (m) =>
    "\n".repeat(m.split("\n").length - 1),
  );
  return stripped
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function collapse(p: string): string {
  const one = p.replace(/\s+/g, " ").trim();
  return one.length > MAX_SNIPPET ? one.slice(0, MAX_SNIPPET) + "…" : one;
}

export function snippetsForSlug(text: string, slug: string): string[] {
  const s = escapeRe(slug);
  // The three reference shapes anchorIndex scans, applied per paragraph:
  // link-to-anchor `](…#slug)`, yaml `{ref: slug}`, bare-slug link `](slug)`.
  const occurrence = new RegExp(
    "\\]\\([^)]*#" + s + "\\)|\\{\\s*ref\\s*:\\s*" + s + "\\b|\\]\\(" + s + "\\)",
  );
  const out: string[] = [];
  for (const p of paragraphs(text)) {
    if (occurrence.test(p)) out.push(collapse(p));
  }
  return Array.from(new Set(out));
}
