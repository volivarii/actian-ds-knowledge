// Rich-mode heading-anchor chip. A VIEW-ONLY ProseMirror decoration (modeled on
// linkReferenceDecoration.ts) that renders a heading's trailing {#slug} as a
// pill and hides the raw marker text. It NEVER edits the doc, so serialization
// and the round-trip drift guards are untouched by construction. Mounted as an
// EXTRA `.use()` in RichBodyEditor, not a milkdownPreset change.
import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { Node as PMNode } from "@milkdown/prose/model";

export interface HeadingAnchorSpan {
  from: number;
  to: number;
  slug: string;
}

// Trailing " {#slug}" (with any leading whitespace) at the end of heading text.
const TRAILING_ANCHOR_RE = /(\s*\{#([a-z][a-z0-9-]*)\})\s*$/;

/** Pure: the trailing-anchor span of every heading that has one. `from` is the
 *  start of the raw ` {#slug}` marker, `to` the end of the heading content.
 *  Assumes a heading's text maps 1:1 to positions (no inline atom nodes before
 *  the marker) — true for normal anchored headings. Exported for tests. */
export function collectHeadingAnchors(doc: PMNode): HeadingAnchorSpan[] {
  const out: HeadingAnchorSpan[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const m = TRAILING_ANCHOR_RE.exec(node.textContent);
    if (!m) return;
    const contentEnd = pos + node.nodeSize - 1;
    out.push({ from: contentEnd - m[1]!.length, to: contentEnd, slug: m[2]! });
  });
  return out;
}

/** The pill element, built lazily at render time (keeps the scan DOM-free). */
function makeChip(slug: string): HTMLElement {
  const el = globalThis.document.createElement("span");
  el.className = "md-anchor-chip";
  el.textContent = `⚓ ${slug}`; // anchor emoji + slug
  el.setAttribute("title", `Section anchor: #${slug}`);
  el.setAttribute("data-anchor-slug", slug);
  return el;
}

/** View decorations: a chip widget at the marker start + an inline class that
 *  hides the raw ` {#slug}` text. Pure over the doc; exported for tests. */
export function headingAnchorDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  for (const s of collectHeadingAnchors(doc)) {
    decos.push(Decoration.widget(s.from, () => makeChip(s.slug), { side: -1 }));
    decos.push(Decoration.inline(s.from, s.to, { class: "md-anchor-raw" }));
  }
  return DecorationSet.create(doc, decos);
}

/** Milkdown plugin: an extra `.use()` in RichBodyEditor, never a preset change. */
export const headingAnchorDecorationPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          return headingAnchorDecorations(state.doc);
        },
      },
    }),
);
