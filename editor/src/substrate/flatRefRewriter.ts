// Flat-array frontmatter rewriter for fields like `relatedComponents`
// that use a YAML inline-array syntax: `fieldName: [slug-a, slug-b]`.
//
// This is distinct from the object-ref rewriter (frontmatterRewriter.ts)
// which handles block-style `- { ref: slug, note: ... }` arrays used by
// a11y_refs / motion_refs / foundations_refs.
//
// Format written: `fieldName: [a, b, c]` on a single line.
// Round-trip note: only single-line inline arrays are parsed; multi-line
// YAML arrays are not modified (they would fall through to "not found",
// triggering an insert).

// Match `fieldName: [...]` on its own line. The value may be empty `[]`
// or contain comma-separated identifiers (slug characters: a-z, 0-9, -)
// with optional surrounding whitespace.
function makeLineRe(field: string): RegExp {
  // Escape field name for use in regex (field names are safe identifiers
  // but we escape defensively).
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}:\\s*\\[([^\\]]*)\\]\\s*$`, "m");
}

/** Parse a comma-separated value string into a trimmed slug array. */
function parseSlugs(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Serialize a slug array back to an inline YAML list. */
function serializeSlugs(field: string, slugs: string[]): string {
  return `${field}: [${slugs.join(", ")}]`;
}

// ── Frontmatter envelope helpers ─────────────────────────────────────────────

const FRONTMATTER_RE = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n/;

function insertIntoFrontmatter(source: string, line: string): string {
  const m = source.match(FRONTMATTER_RE);
  if (!m) {
    // No frontmatter envelope — prepend one.
    return `---\n${line}\n---\n\n${source}`;
  }
  // Insert after the opening `---` fence (= before the body of the block).
  const fenceEnd = source.indexOf("\n") + 1; // end of first `---` line
  return source.slice(0, fenceEnd) + line + "\n" + source.slice(fenceEnd);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Add `slug` to a flat-array frontmatter field (e.g. `relatedComponents`).
 * Idempotent: if the slug is already in the list, the source is returned
 * unchanged. If the field is absent, it is prepended to the frontmatter.
 */
export function addFlatRefToFrontmatter(
  source: string,
  field: string,
  slug: string,
): string {
  const re = makeLineRe(field);
  const m = source.match(re);
  if (m) {
    const slugs = parseSlugs(m[1] ?? "");
    if (slugs.includes(slug)) return source; // already present
    const updated = serializeSlugs(field, [...slugs, slug]);
    return source.replace(re, updated);
  }
  // Field absent — insert it.
  return insertIntoFrontmatter(source, serializeSlugs(field, [slug]));
}

/**
 * Remove `slug` from a flat-array frontmatter field. When the list becomes
 * empty after removal, the entire key line is removed. Returns source
 * unchanged when the slug is not present.
 */
export function removeFlatRefFromFrontmatter(
  source: string,
  field: string,
  slug: string,
): string {
  const re = makeLineRe(field);
  const m = source.match(re);
  if (!m) return source; // field absent → nothing to remove
  const slugs = parseSlugs(m[1] ?? "");
  if (!slugs.includes(slug)) return source; // slug not in list
  const next = slugs.filter((s) => s !== slug);
  if (next.length === 0) {
    // Drop the key entirely (+ trailing newline).
    return source.replace(new RegExp(`^${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*\\[[^\\]]*\\]\\s*\\n?`, "m"), "");
  }
  return source.replace(re, serializeSlugs(field, next));
}
