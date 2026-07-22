// Pure rename of a heading anchor within one file's markdown text: the marker
// {#oldSlug} -> {#newSlug} and every SAME-FILE link ](#oldSlug) -> ](#newSlug)
// (empty path before # only). Cross-file links ](path#oldSlug) are left alone,
// and anything inside fenced OR inline code is untouched (matching anchorScan's
// definition of a "real" anchor occurrence, so the rename never rewrites the
// illustrative `{#slug}` / `[x](#slug)` syntax the preservation guard already
// declines to count). Produces only standard markers/links, so the round-trip
// drift guards are unaffected.
import type { Octokit } from "@octokit/rest";
import { loadAnchorIndex, findReferences } from "../lib/anchorIndex";

// A fence OPENS on a line of >=3 backticks or tildes (up to 3 leading spaces,
// optional info string after). It CLOSES on a later line of the SAME character,
// length >= the opening run, and nothing else but whitespace. Tracking the
// character + length (rather than pairing the first delimiter with the next
// one) is what makes a longer outer fence wrapping a shorter inner example
// (```` wrapping ```), and an unterminated fence, behave per CommonMark.
const FENCE_OPEN_RE = /^\s{0,3}(`{3,}|~{3,})/;
// Inline code spans on a live line, mirroring anchorScan.ts's INLINE_CODE_RE so
// both agree on what counts as protected illustrative syntax vs a live anchor.
const INLINE_CODE_SPLIT_RE = /(`[^`\n]*`)/g;

function escapeSlug(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/** Apply `fn` to every run of text that is OUTSIDE fenced code AND outside
 *  inline code; protected spans pass through verbatim. This is the single
 *  source of the "what is a live anchor occurrence" rule shared by the rename
 *  and its disclosure count, so the count can never overstate the rewrite. */
function mapLiveSegments(text: string, fn: (seg: string) => string): string {
  const lines = text.split("\n");
  let fence: { char: string; len: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence) {
      const closeRe = new RegExp(`^\\s{0,3}${fence.char}{${fence.len},}\\s*$`);
      if (closeRe.test(line)) fence = null;
      continue; // inside the fence (including its closing line): never touched
    }
    const open = FENCE_OPEN_RE.exec(line);
    if (open) {
      const run = open[1]!;
      fence = { char: run[0]!, len: run.length };
      continue; // the opening fence line itself carries no live anchors
    }
    lines[i] = line
      .split(INLINE_CODE_SPLIT_RE)
      .map((seg, j) => (j % 2 === 1 ? seg : fn(seg)))
      .join("");
  }
  return lines.join("\n");
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
  // Replacer FUNCTIONS (not strings): a `$` in newSlug must land literally, not
  // be interpreted as a `$&`/`$1` replacement pattern.
  return mapLiveSegments(text, (seg) =>
    seg
      .replace(marker, () => `{#${newSlug}}`)
      .replace(sameFileLink, () => `](#${newSlug})`),
  );
}

/** How many same-file `](#slug)` links renameAnchorInText would actually
 *  rewrite (fenced + inline code excluded, exactly as the rename excludes
 *  them). Feeds the popover's "N links in this file will be updated"
 *  disclosure, so the number never overstates what the rename touches. */
export function countSameFileLinks(text: string, slug: string): number {
  const link = new RegExp(`\\]\\(#${escapeSlug(slug)}\\)`, "g");
  let n = 0;
  mapLiveSegments(text, (seg) => {
    n += (seg.match(link) || []).length;
    return seg;
  });
  return n;
}

/** Source (.md, non-dist) files that reference `oldSlug`, minus the current
 *  file. The honest "these will not be auto-updated" disclosure list. */
export async function crossFileReferrers(
  octokit: Octokit,
  oldSlug: string,
  currentPath: string,
): Promise<string[]> {
  await loadAnchorIndex(octokit);
  return findReferences(oldSlug)
    .filter(
      (p) =>
        p !== currentPath &&
        !p.startsWith("components/dist/") &&
        !p.startsWith("foundations/dist/") &&
        !p.startsWith("accessibility/dist/"),
    )
    .sort();
}
