// Rich-mode (Milkdown/WYSIWYG) equivalent of the CM6 heading-scroll used in
// source mode. There is no CodeMirror view to dispatch a scroll effect
// against in rich mode, so this walks the rendered `.milkdown` DOM and
// scrolls to the heading at the given INDEX, rather than matching on
// rendered heading text: text matching breaks on duplicate heading text
// (always resolves to the first occurrence) and on inline markdown inside a
// heading (e.g. backticks), whose rendered textContent differs from the
// plain Heading.text headingScan produces. Shared by MarkdownEditScreen
// (source + rich mounting) and the frontmatter-form body view (rich body
// editor).
import type { Heading } from "../lib/headingScan";

export function scrollRichHeading(
  _heading: Heading,
  headingIndex: number,
): void {
  const root = document.querySelector(".milkdown");
  if (!root) return;
  // Query range MUST match headingScan's level range (H1-H3, `#{1,3}`):
  // querying h1-h6 would break index parity for a document with H4+
  // headings, since headingScan (and the RelationsPanel outline built on
  // it) never counts them.
  const nodes = root.querySelectorAll("h1,h2,h3");
  const target = nodes[headingIndex];
  target?.scrollIntoView({ block: "start", behavior: "smooth" });
}
