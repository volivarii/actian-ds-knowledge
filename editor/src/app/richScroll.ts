// Rich-mode (Milkdown/WYSIWYG) equivalent of the CM6 heading-scroll used in
// source mode. There is no CodeMirror view to dispatch a scroll effect
// against in rich mode, so this walks the rendered `.milkdown` DOM and
// matches on heading text instead. Shared by MarkdownEditScreen (source +
// rich mounting) and the frontmatter-form body view (rich body editor).
import type { Heading } from "../lib/headingScan";

// Matches headingScan's TRAILING_ANCHOR_RE: authors may write a trailing
// `{#slug}` on a heading for cross-consumer anchor contracts. headingScan
// strips it before storing Heading.text, but the rendered Milkdown DOM still
// shows it in textContent, so strip it here too before comparing.
const TRAILING_ANCHOR_RE = /\s*\{#[a-z0-9][a-z0-9-]*\}\s*$/;

export function scrollRichHeading(heading: Heading): void {
  const root = document.querySelector(".milkdown");
  if (!root) return;
  const nodes = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6"));
  const target = nodes.find((n) => {
    const domText = (n.textContent ?? "")
      .replace(TRAILING_ANCHOR_RE, "")
      .trim();
    return domText === heading.text.trim();
  });
  target?.scrollIntoView({ block: "start", behavior: "smooth" });
}
