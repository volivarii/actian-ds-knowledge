// The one fenced-code rule, shared.
//
// Four modules used to decide independently what a code fence is, and they
// disagreed in three different ways:
//
//   * `headingScan` and `SectionFocusTracker` toggled on ``` only, so a heading
//     inside a ~~~ block got an outline row while the reference index ignored
//     the whole block;
//   * widening those toggles to `/^(?:```|~~~)/` fixed that and broke nesting,
//     because an inner ``` then CLOSED an outer ~~~ and every heading after it
//     became live — including, in one measured case, the heading the file's
//     outgoing count landed on;
//   * `searchBodyText.FENCED_CODE_RE` is not line-anchored, so an inline ```
//     in a sentence opens a fence for the index but for neither scanner.
//
// `anchorRename.mapLiveSegments` had it right the whole time and was the only
// one that did. This is that logic, extracted, so the rule has one home rather
// than four spellings.
//
// CommonMark, to the extent these callers need it: a fence opens on up to three
// spaces of indent followed by a run of three or more backticks or tildes, and
// closes on a later line of the SAME character with a run at least as long and
// nothing after it but whitespace. Tracking the character and the length is
// what makes a longer outer fence wrapping a shorter inner example behave, and
// what leaves an unterminated fence open to the end of the document.

const FENCE_OPEN_RE = /^\s{0,3}(`{3,}|~{3,})/;

/** Per line: true when that line is inside a fenced code block, or is one of
 *  its delimiter lines. Index-aligned with `text.split("\n")`.
 *
 *  Returned as a mask rather than a stripped string so callers that need line
 *  NUMBERS — the heading scanners report a heading's line — keep them. A
 *  caller that only wants the prose can `.filter()` on it. */
export function fencedLineMask(text: string): boolean[] {
  const lines = text.split("\n");
  const mask = new Array<boolean>(lines.length).fill(false);
  let fence: { char: string; len: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence) {
      mask[i] = true; // the closing delimiter line counts as inside
      const closeRe = new RegExp(`^\\s{0,3}${fence.char}{${fence.len},}\\s*$`);
      if (closeRe.test(line)) fence = null;
      continue;
    }
    const open = FENCE_OPEN_RE.exec(line);
    if (open) {
      const run = open[1]!;
      fence = { char: run[0]!, len: run.length };
      mask[i] = true; // the opening delimiter line counts as inside
    }
  }
  return mask;
}

/** The text with every fenced block replaced by blank lines.
 *
 *  Blank lines rather than removal, so line numbers survive: a caller that
 *  reports a heading's position must not have it shift because a code block
 *  above it vanished. */
export function blankFencedCode(text: string): string {
  const lines = text.split("\n");
  const mask = fencedLineMask(text);
  return lines.map((l, i) => (mask[i] ? "" : l)).join("\n");
}
