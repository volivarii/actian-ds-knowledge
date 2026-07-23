// Author-typed label → kebab-case filename slug. Shared by the "add a thing"
// dialogs so a new section and a new product derive their filename the same
// way, and validate it against the same shape.

export const SLUG_RE = /^[a-z][a-z0-9-]*$/;

export function slugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
