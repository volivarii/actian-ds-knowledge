// Author-typed label → kebab-case filename slug. Shared by the "add a thing"
// dialogs so a new section and a new product derive their filename the same
// way, and validate it against the same shape.

export const SLUG_RE = /^[a-z][a-z0-9-]*$/;

/** Matches the `maxLength` every app-context slug schema declares. A longer
 *  slug passes SLUG_RE and then fails CI on the opened pull request, far from
 *  the field that produced it. */
export const SLUG_MAX_LENGTH = 60;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= SLUG_MAX_LENGTH;
}

export function slugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
