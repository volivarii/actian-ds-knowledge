// Extract H1-H3 headings from markdown text for the Outline panel.
//
// Returns one entry per heading with its level, display text, and
// 0-indexed line number (for CM6's view.dispatch + scrollIntoView).
//
// Scanning rules:
//   1. Iterate line-by-line so line numbers stay accurate (regex-strip
//      approaches collapse the original source).
//   2. Skip the YAML frontmatter envelope when present (line 0 is `---`).
//      Frontmatter often contains `#` comment lines that would otherwise
//      be mistaken for H1 headings and show up in the Outline.
//   3. Skip any line the shared fenced-code mask marks (see lib/fencedCode):
//      ``` and ~~~ alike, nesting-aware, and never opened from inside the
//      frontmatter envelope.
//   4. Match /^(#{1,3})\s+(.+)$/ outside fences.
//   5. Strip a trailing `{#slug}` from the display text (authors include
//      these for cross-consumer anchor contracts; the slug isn't part of
//      the visible heading prose).
//   6. Skip blank/whitespace-only headings.

import { fencedLineMask } from "./fencedCode";

export interface Heading {
  level: 1 | 2 | 3;
  text: string;
  /** 0-indexed line number in the source markdown. */
  line: number;
}

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*$/;
// An explicit anchor must start with a LETTER, matching
// `anchorIndex.HEADING_ANCHOR_RE` (which decides what can ever BE an anchor)
// and `SectionFocusTracker.TRAILING_ANCHOR_RE`. This allowed a digit, so
// "## {#2fa}" stripped to empty text and the heading was dropped here while
// SectionFocusTracker kept it and derived "2fa" — a section that owned file
// scope with no outline row to show for it.
const TRAILING_ANCHOR_RE = /\s*\{#[a-z][a-z0-9-]*\}\s*$/;
const FRONTMATTER_FENCE_RE = /^---\s*$/;

export function scanHeadings(text: string): Heading[] {
  const lines = text.split("\n");
  const out: Heading[] = [];
  // Detect the YAML frontmatter envelope and skip past its closing `---`.
  // Only a `---` on line 0 opens frontmatter; mid-document `---` is a
  // markdown thematic break and stays scanned as content.
  let i = 0;
  if (lines.length > 0 && FRONTMATTER_FENCE_RE.test(lines[0]!)) {
    let j = 1;
    while (j < lines.length && !FRONTMATTER_FENCE_RE.test(lines[j]!)) j++;
    if (j < lines.length) i = j + 1;
  }
  // Fenced code is read from the shared rule in `lib/fencedCode`, not decided
  // here: a local toggle got nesting wrong (an inner ``` closed an outer ~~~)
  // and each module spelled the rule differently. Masked FROM THE BODY, never
  // from line 0 — a YAML block scalar in the envelope can carry a line of
  // three backticks, and a whole-document mask read that as a fence the
  // envelope's `---` could not close, so every heading in the file vanished.
  // The mask is line-indexed, so the line numbers this scanner reports are
  // unaffected.
  const fenced = fencedLineMask(text, i);
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (fenced[i]) continue;
    const match = HEADING_RE.exec(line);
    if (!match) continue;
    const level = match[1]!.length as 1 | 2 | 3;
    const rawText = match[2]!;
    const text = rawText.replace(TRAILING_ANCHOR_RE, "").trim();
    if (text.length === 0) continue;
    out.push({ level, text, line: i });
  }
  return out;
}
