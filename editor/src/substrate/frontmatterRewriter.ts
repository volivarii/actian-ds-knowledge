// Pure helpers that add/remove a transversal-ref entry in a file's YAML
// frontmatter. String-level operations (no full YAML parse) — the
// substrate's authoring subset is fixed and documented.

import type { RefType } from "./refGraph";

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;
const REF_BLOCK_BY_TYPE_RE = (type: RefType) =>
  new RegExp(`^${type}:\\s*\\n((?:\\s*-\\s+\\{[^}]*\\}\\s*\\n?)+)`, "m");
const REF_ENTRY_BY_SLUG_RE = (slug: string) =>
  new RegExp(`\\s*-\\s+\\{[^}]*ref\\s*:\\s*${slug}\\b[^}]*\\}\\s*\\n?`, "g");

function formatEntry(slug: string, note: string | null): string {
  if (note === null || note.trim().length === 0) {
    return `  - { ref: ${slug} }`;
  }
  const escaped = note.replace(/"/g, '\\"');
  return `  - { ref: ${slug}, note: "${escaped}" }`;
}

export interface RefPick {
  slug: string;
  note: string | null;
}

export function addRefToFrontmatter(source: string, refType: RefType, pick: RefPick): string {
  const fm = source.match(FRONTMATTER_RE);
  const newEntry = formatEntry(pick.slug, pick.note);

  if (!fm) {
    return `---\n${refType}:\n${newEntry}\n---\n\n${source}`;
  }

  const fmBlock = fm[1] ?? "";
  const blockRe = REF_BLOCK_BY_TYPE_RE(refType);
  const blockMatch = fmBlock.match(blockRe);

  let newFmBlock: string;
  if (blockMatch) {
    newFmBlock = fmBlock.replace(blockRe, (matched) => `${matched.trimEnd()}\n${newEntry}\n`);
  } else {
    const trimmed = fmBlock.trimEnd();
    newFmBlock = `${trimmed}\n${refType}:\n${newEntry}\n`;
  }

  const before = source.slice(0, fm.index ?? 0);
  const after = source.slice((fm.index ?? 0) + (fm[0]?.length ?? 0));
  return `${before}---\n${newFmBlock}---\n${after}`;
}

export function removeRefFromFrontmatter(source: string, refType: RefType, slug: string): string {
  const fm = source.match(FRONTMATTER_RE);
  if (!fm) return source;

  let fmBlock = fm[1] ?? "";
  const blockRe = REF_BLOCK_BY_TYPE_RE(refType);
  const blockMatch = fmBlock.match(blockRe);
  if (!blockMatch) return source;

  const entriesText = blockMatch[1] ?? "";
  const entryRe = REF_ENTRY_BY_SLUG_RE(slug);
  const newEntries = entriesText.replace(entryRe, "");

  if (newEntries.trim().length === 0) {
    fmBlock = fmBlock.replace(blockRe, "");
  } else {
    fmBlock = fmBlock.replace(blockRe, `${refType}:\n${newEntries}`);
  }

  const before = source.slice(0, fm.index ?? 0);
  const after = source.slice((fm.index ?? 0) + (fm[0]?.length ?? 0));
  return `${before}---\n${fmBlock}---\n${after}`;
}
