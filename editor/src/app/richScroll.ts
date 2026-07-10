// Rich-mode (Milkdown/WYSIWYG) equivalent of the CM6 heading-scroll used in
// source mode. There is no CodeMirror view to dispatch a scroll effect
// against in rich mode, so this walks the rendered `.milkdown` DOM and
// matches on heading text instead. Shared by MarkdownEditScreen (source +
// rich mounting) and the frontmatter-form body view (rich body editor).
import type { Heading } from "../lib/headingScan";

export function scrollRichHeading(heading: Heading): void {
  const root = document.querySelector(".milkdown");
  if (!root) return;
  const nodes = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6"));
  const target = nodes.find(
    (n) => n.textContent?.trim() === heading.text.trim(),
  );
  target?.scrollIntoView({ block: "start", behavior: "smooth" });
}
