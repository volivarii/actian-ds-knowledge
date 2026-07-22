// Delegated click controller for the rich-mode heading-anchor chip.
//
// headingAnchorDecoration renders each heading's {#slug} as a `.md-anchor-chip`
// widget carrying data-anchor-slug. This installs ONE delegated click listener
// on a shared root (mirrors installCrossSurfaceHighlight) so a click on any chip
// opens the rename popover, and it keeps working as the rich editor repaints its
// decorations (no per-chip re-binding). Returns a cleanup function.

const SLUG_ATTR = "data-anchor-slug";

export function installAnchorChipRename(
  root: HTMLElement,
  onClick: (slug: string, el: HTMLElement) => void,
): () => void {
  const handler = (e: Event) => {
    const target = e.target;
    const el = target instanceof Element ? target.closest(`[${SLUG_ATTR}]`) : null;
    if (!(el instanceof HTMLElement)) return;
    const slug = el.getAttribute(SLUG_ATTR);
    if (!slug) return;
    onClick(slug, el);
  };
  root.addEventListener("click", handler);
  return () => root.removeEventListener("click", handler);
}
