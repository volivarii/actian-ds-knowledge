// Pure rename of a heading anchor within one file's markdown text: the marker
// {#oldSlug} -> {#newSlug} and every SAME-FILE link ](#oldSlug) -> ](#newSlug)
// (empty path before # only). Cross-file links ](path#oldSlug) are left alone,
// and anything inside a fenced code block is untouched. Produces only standard
// markers/links, so the round-trip drift guards are unaffected.
const FENCE_SPLIT_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;

function escapeSlug(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

export function renameAnchorInText(
  text: string,
  oldSlug: string,
  newSlug: string,
): string {
  if (oldSlug === newSlug) return text;
  const o = escapeSlug(oldSlug);
  const marker = new RegExp(`\\{#${o}\\}`, "g");
  const sameFileLink = new RegExp(`\\]\\(#${o}\\)`, "g");
  // Split on fenced blocks; transform only the non-fence segments (even indices).
  return text
    .split(FENCE_SPLIT_RE)
    .map((seg, i) =>
      i % 2 === 1 // odd segments are the captured fenced blocks
        ? seg
        : seg
            .replace(marker, `{#${newSlug}}`)
            .replace(sameFileLink, `](#${newSlug})`),
    )
    .join("");
}
