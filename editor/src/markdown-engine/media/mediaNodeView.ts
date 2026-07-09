import { $view } from "@milkdown/utils";
import { htmlSchema } from "@milkdown/preset-commonmark";
import { parseMediaTag, resolveMediaSrc } from "./mediaTag";

// Slug for preview resolution is provided per-editor via a module-level setter
// (the NodeView factory closes over it). null slug -> labeled chip, no image.
let currentSlug: string | null = null;
export function setMediaPreviewSlug(slug: string | null): void {
  currentSlug = slug;
}

// Display-only NodeView over the commonmark `html` node. NOTE (confirmed against
// @milkdown/preset-commonmark 7.21.2): the `html` node is an INLINE ATOM that
// stores its raw markup in `node.attrs.value` — `node.textContent` is always ""
// for an atom. So we read `node.attrs.value` (the brief's `node.textContent` was
// written against a hypothetical text-holding node and would never match here).
// The view NEVER mutates attrs, so the toMarkdown runner still emits the original
// <Media …/> verbatim and getMarkdown() stays byte-exact (media-roundtrip test
// enforces this).
export const mediaNodeView = $view(htmlSchema.node, () => (node) => {
  const raw = typeof node.attrs.value === "string" ? node.attrs.value : "";
  const attrs = parseMediaTag(raw);
  const dom = document.createElement("span");
  if (!attrs) {
    dom.textContent = raw; // non-Media html: passthrough, unchanged
    return { dom };
  }
  dom.className = "md-media-chip";
  dom.setAttribute("contenteditable", "false");
  if (currentSlug) {
    const img = document.createElement("img");
    img.src = "/" + resolveMediaSrc(currentSlug, attrs.role); // preview only
    img.alt = `Media: ${attrs.role}${attrs.layout ? ` (${attrs.layout})` : ""}`;
    img.className = "md-media-chip__img";
    dom.appendChild(img);
  } else {
    dom.textContent = `Media: ${attrs.role}${attrs.layout ? ` · ${attrs.layout}` : ""}`;
  }
  return { dom };
});
