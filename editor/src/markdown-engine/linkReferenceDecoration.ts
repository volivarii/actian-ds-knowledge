// Typed inline references for Milkdown rich mode.
//
// The rich-mode counterpart of the preview's typed links (Preview.tsx): a
// VIEW-ONLY ProseMirror decoration that puts a color dot before, and a class +
// data hooks on, any link whose href resolves to a substrate component. It
// NEVER edits the doc, so markdown serialization and the round-trip drift
// guards are untouched by construction (same guarantee the reference
// autocomplete relies on). Mounted as an EXTRA `.use()` in RichBodyEditor, not
// a milkdownPreset change.
import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { Node as PMNode } from "@milkdown/prose/model";
import { resolveReference } from "../lib/resolveReference";
import { relationTypeColor, relationTypeLabel } from "../lib/relationTypes";

export interface LinkReferenceSpan {
  from: number;
  to: number;
  slug: string;
  type: string;
}

/** Text spans carrying a link mark whose href resolves to a substrate
 *  reference. Contiguous text nodes of the same link (e.g. a link whose text
 *  has internal bold) coalesce into ONE span, so a formatted link gets a single
 *  dot, not one per text node. Pure + exported for tests. */
export function collectLinkReferences(doc: PMNode): LinkReferenceSpan[] {
  const spans: LinkReferenceSpan[] = [];
  let run: LinkReferenceSpan | null = null;
  doc.descendants((node, pos) => {
    if (!node.isText) {
      run = null; // a non-text node breaks the current link run
      return;
    }
    const link = node.marks.find((m) => m.type.name === "link");
    const href = link ? (link.attrs.href as string | undefined) : undefined;
    const ref = href ? resolveReference(href) : null;
    if (!ref) {
      run = null;
      return;
    }
    const to = pos + node.nodeSize;
    // Extend the current run if this text node is adjacent and points at the
    // same target; otherwise start a new span.
    if (run && run.slug === ref.slug && run.to === pos) {
      run.to = to;
    } else {
      run = { from: pos, to, slug: ref.slug, type: ref.type };
      spans.push(run);
    }
  });
  return spans;
}

/** DOM attributes for the inline decoration on a resolving link: the highlight
 *  hooks (class + data-ref/data-node-type) and a `title` naming the type in
 *  words, so the reference is not distinguished by its color dot alone (WCAG
 *  1.4.1). Pure + exported for tests. */
export function linkReferenceInlineAttrs(span: LinkReferenceSpan): {
  class: string;
  "data-ref": string;
  "data-node-type": string;
  title: string;
} {
  return {
    class: "md-ref",
    "data-ref": span.slug,
    "data-node-type": span.type,
    title: relationTypeLabel(span.type),
  };
}

/** A typed color dot, built lazily by the widget decoration at render time
 *  (never at decoration-creation time, so the scan stays DOM-free). Mirrors the
 *  preview's `.md-ref-dot` so both surfaces read identically. */
function makeDot(color: string): HTMLElement {
  const el = globalThis.document.createElement("span");
  el.className = "md-ref-dot";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "display:inline-block;width:7px;height:7px;border-radius:999px;" +
    "margin-right:4px;vertical-align:baseline;background:" +
    color;
  return el;
}

/** View decorations for every resolving link: a dot widget before it, and a
 *  class + data hooks on its span (for the cross-surface highlight). Pure over
 *  the doc; exported for tests. */
export function linkReferenceDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  for (const s of collectLinkReferences(doc)) {
    const color = relationTypeColor(s.type);
    decos.push(Decoration.widget(s.from, () => makeDot(color), { side: -1 }));
    decos.push(Decoration.inline(s.from, s.to, linkReferenceInlineAttrs(s)));
  }
  return DecorationSet.create(doc, decos);
}

/** Milkdown plugin: an extra `.use()` in RichBodyEditor, never a preset change.
 *  Only adds view decorations, so the byte-exact serialization contract holds. */
export const linkReferenceDecorationPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          return linkReferenceDecorations(state.doc);
        },
      },
    }),
);
