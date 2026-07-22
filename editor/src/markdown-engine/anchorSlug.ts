// Slug derivation for heading anchors. Pure, no editor/prose imports so both
// the source (CodeMirror) and rich (Milkdown) toolbars derive identically.
// Output always matches ^[a-z][a-z0-9-]*$: it satisfies anchorScan's contract
// grammar AND anchorIndex's stricter leading-letter definition scanners.

/** Kebab-case + guarantee a leading letter. Empty / letter-less input -> "section". */
export function baseSlug(text: string): string {
  const kebab = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[^a-z]+/, ""); // drop any leading digits/hyphens
  return kebab || "section";
}

/** Derive a slug from heading text that is unique against `taken`, appending
 *  -2, -3, ... on collision. */
export function deriveUniqueSlug(text: string, taken: Iterable<string>): string {
  const base = baseSlug(text);
  const set = taken instanceof Set ? taken : new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
