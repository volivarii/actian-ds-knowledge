// Coordinated cross-surface highlight.
//
// Every relation surface tags its elements with data-ref = the referenced
// slug: the inline typed links (preview + rich mode) and the relations-rail
// rows. This installs one delegated listener on a shared root so that hovering
// or focusing any element with a data-ref lights every element in the root that
// shares it (class "rel-hot"). Delegation means it covers content that
// re-renders (the rail and preview repaint as the doc changes) without
// re-binding. Returns a cleanup function.

const HOT_CLASS = "rel-hot";
const REF_ATTR = "data-ref";

function escapeRef(ref: string): string {
  const cssApi = (globalThis as { CSS?: { escape?: (s: string) => string } })
    .CSS;
  return cssApi?.escape ? cssApi.escape(ref) : ref;
}

export function installCrossSurfaceHighlight(root: HTMLElement): () => void {
  let active: string | null = null;

  function paint(ref: string, on: boolean): void {
    root
      .querySelectorAll(`[${REF_ATTR}="${escapeRef(ref)}"]`)
      .forEach((el) => el.classList.toggle(HOT_CLASS, on));
  }

  function clear(): void {
    if (active !== null) {
      paint(active, false);
      active = null;
    }
  }

  function focusRef(target: EventTarget | null): void {
    const el = target instanceof Element ? target.closest(`[${REF_ATTR}]`) : null;
    const ref = el ? el.getAttribute(REF_ATTR) : null;
    if (ref === active) return;
    clear();
    if (ref) {
      paint(ref, true);
      active = ref;
    }
  }

  const onEnter = (e: Event) => focusRef(e.target);
  const onLeave = () => clear();

  root.addEventListener("pointerover", onEnter);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("focusin", onEnter);
  root.addEventListener("focusout", onLeave);

  return () => {
    root.removeEventListener("pointerover", onEnter);
    root.removeEventListener("pointerleave", onLeave);
    root.removeEventListener("focusin", onEnter);
    root.removeEventListener("focusout", onLeave);
    clear();
  };
}
