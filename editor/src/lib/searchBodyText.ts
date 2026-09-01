/**
 * How a source file becomes searchable text.
 *
 * One definition, shared by the build-time generator
 * (`scripts/gen-search-bodies.ts`) and by the tests that assert what search can
 * find. The generator runs in Node and the result ships to the browser, so this
 * module must stay pure: no fs, no fetch, no React.
 *
 * What survives is what a reader sees. Fenced code and HTML comments are
 * machinery rather than guidance, and a URL inside a link is a long string of
 * tokens nobody searches for but that matches plenty of them. Everything else
 * is kept verbatim, including case, because the matched phrase is shown back to
 * the author as a snippet and a lower-cased corpus would turn every snippet
 * into a shout.
 *
 * Frontmatter contributes its VALUES. For the domains the editor edits through
 * a form, the frontmatter is the guidance rather than machinery around it:
 * `words-to-avoid.md` keeps every word it tells you to avoid there, and all 64
 * app-context records keep their label, properties and apps there. Dropping it
 * left those files with a title and a sentence, so the defect this module
 * exists to fix stayed open for precisely the files whose form hides the file
 * best. Keys are dropped, because `properties`, `reason` and `status` name the
 * form's fields rather than what an author wrote into them.
 */
import { parse as parseYaml } from "yaml";

/** A fenced code block, ``` or ~~~. Owned here because both the search corpus
 *  and the anchor scanner mean the same thing by it; `anchorIndex` re-exports
 *  this rather than keeping a second regex that could drift from it. */
const FENCED_CODE_RE = /(?:```|~~~)[\s\S]*?(?:```|~~~)/g;

/** Fenced code replaced by its own newlines, so line numbers survive for
 *  callers that count them (the anchor scanner does). */
export function stripFencedCode(text: string): string {
  return text.replace(FENCED_CODE_RE, (m) =>
    "\n".repeat(m.split("\n").length - 1),
  );
}

/** Leading YAML frontmatter. Anchored at the very start: a `---` rule further
 *  down a document is a horizontal rule, not a second frontmatter block, and
 *  an unanchored match would swallow the prose between them. */
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
/** `[label](target)` -> `label`. The target is dropped: a search for "button"
 *  should not match every file that links to `../button/content.md`. */
const MD_LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;
/** A table's delimiter row (`| --- | :--: |`). It is layout, and left in it
 *  reaches the reader as a run of dashes. */
const TABLE_RULE_RE = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm;
/** A thematic break: `***`, `---`, `___`, with or without spaces. */
const THEMATIC_BREAK_RE = /^[ \t]*(?:\*[ \t]*){3,}$|^[ \t]*(?:-[ \t]*){3,}$|^[ \t]*(?:_[ \t]*){3,}$/gm;
/** Line-leading markdown furniture: heading hashes, blockquote markers and
 *  list bullets. Dropped so a snippet reads as a sentence. */
const LINE_FURNITURE_RE = /^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+)/gm;
/** Emphasis and code-span markers. The words between them are the guidance;
 *  the markers are how markdown says it. Single `*` and `_` are left alone —
 *  `_` is inside identifiers like `data_product`. */
const MARKERS_RE = /\*\*|__|`/g;
/** A table's cell separator. Replaced rather than dropped, so a row of cells
 *  reads as a list instead of running into one sentence. */
const TABLE_CELL_RE = /[ \t]*\|[ \t]*/g;

/** Every string in a parsed YAML value, in document order. Numbers, booleans
 *  and dates are left out: `nav_order: 5` is layout, and no author searches
 *  for it. */
function strings(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    const t = value.trim();
    if (t) into.push(t);
  } else if (Array.isArray(value)) {
    for (const v of value) strings(v, into);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) strings(v, into);
  }
}

/**
 * The frontmatter's values as text, or "" when there is none.
 *
 * A malformed block costs its own values and nothing else: the body is still
 * indexed, so a file mid-edit degrades rather than disappearing from search.
 * These files are schema-validated in CI, so this is a floor, not a plan.
 */
function frontmatterText(raw: string): string {
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) return "";
  const yaml = m[0].replace(/^---\r?\n/, "").replace(/---[ \t]*(?:\r?\n|$)$/, "");
  const out: string[] = [];
  try {
    strings(parseYaml(yaml), out);
  } catch {
    return "";
  }
  return out.join(" \u00b7 ");
}

/**
 * The searchable text of one source file.
 *
 * Returns "" for a file with nothing left after the machinery is removed (an
 * index stub, a file that is only frontmatter). Callers drop those rather than
 * carrying an entry that can never match.
 */
export function searchableText(raw: string): string {
  const front = frontmatterText(raw);
  const body = stripFencedCode(raw.replace(FRONTMATTER_RE, ""))
    .replace(HTML_COMMENT_RE, " ")
    .replace(MD_LINK_RE, "$1")
    .replace(TABLE_RULE_RE, "")
    .replace(THEMATIC_BREAK_RE, "")
    .replace(LINE_FURNITURE_RE, "")
    .replace(MARKERS_RE, "")
    .replace(TABLE_CELL_RE, " \u00b7 ")
    .replace(/(?:\s*\u00b7)+\s*$/gm, "")
    .replace(/^\s*\u00b7\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  // Frontmatter first: it holds the title, so a document's text opens with its
  // own name the way the screen does.
  return front && body ? `${front} \u00b7 ${body}` : front || body;
}
