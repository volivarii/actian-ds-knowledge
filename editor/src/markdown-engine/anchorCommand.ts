// The rich-mode "add anchor" toolbar command. Appends a unique ` {#slug}` to the
// heading at the cursor. Additive only: inert on a non-heading and on a heading
// that already has an anchor (rename/remove is Slice 2). It only ever emits a
// standard {#slug}, so the RichToolbar per-command round-trip guard covers it.
import { $command } from "@milkdown/utils";
import type { Command } from "@milkdown/prose/state";
import type { Node as PMNode } from "@milkdown/prose/model";
import { deriveUniqueSlug } from "./anchorSlug";

const TRAILING_ANCHOR_RE = /\{#[a-z][a-z0-9-]*\}\s*$/;
const ANCHOR_RE = /\{#([a-z][a-z0-9-]*)\}/g;

/** Every {#slug} defined anywhere in the doc (for uniqueness). */
export function docAnchorSlugs(doc: PMNode): Set<string> {
  const slugs = new Set<string>();
  doc.descendants((node) => {
    if (node.isText && node.text) {
      for (const m of node.text.matchAll(ANCHOR_RE)) slugs.add(m[1]!);
    }
  });
  return slugs;
}

export const addAnchorCommand = $command(
  "AddSectionAnchor",
  () => (): Command => (state, dispatch) => {
    const { $from } = state.selection;
    const parent = $from.parent;
    if (parent.type.name !== "heading") return false; // headings only
    // Section headings only (H1-H3), matching the editor's outline model and
    // the source toolbar's scanHeadings check.
    const level = parent.attrs.level as number | undefined;
    if (typeof level === "number" && level > 3) return false;
    if (TRAILING_ANCHOR_RE.test(parent.textContent)) return false; // additive only
    const slug = deriveUniqueSlug(
      parent.textContent,
      docAnchorSlugs(state.doc),
    );
    // Insert an UNMARKED text node. tr.insertText would inherit a trailing
    // inline mark (e.g. a heading ending in *emphasis*) and embed the marker
    // inside the markup: `*draft {#slug}*` instead of `*draft* {#slug}`.
    if (dispatch) {
      dispatch(state.tr.insert($from.end(), state.schema.text(` {#${slug}}`)));
    }
    return true;
  },
);
