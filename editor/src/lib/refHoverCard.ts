// Inline reference hover-preview card.
//
// The richer replacement for the bare type tooltip on inline typed links: a
// delegated controller on a shared root that, when a `.md-ref[data-ref]` link
// is hovered or focused, shows a single floating card with the target's type
// badge, cleaned title, and graph context (its category + how many components
// use it). One controller covers both rendered surfaces (preview + rich mode)
// since both emit `.md-ref[data-ref]` DOM. Returns a cleanup function.
//
// a11y: the links keep their native `title` (the type) as the screen-reader
// baseline. On MOUSE hover we suppress that title while the card is up so there
// is no double tooltip; on keyboard focus we keep the title (the card is a
// sighted enhancement, the title carries the type for SR). Wiring the card as a
// proper aria-describedby tooltip is a follow-on.
import { referenceCardData } from "./referenceCard";
import { relationTypeColor, relationTypeLabel } from "./relationTypes";

export function installRefHoverCard(root: HTMLElement): () => void {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  let card: HTMLElement | null = null;
  // The link whose native title we suppressed (to restore on hide).
  let suppressed: HTMLElement | null = null;

  function ensureCard(): HTMLElement {
    if (card) return card;
    const c = doc.createElement("div");
    c.className = "ref-hover-card";
    c.setAttribute("role", "tooltip");
    c.hidden = true;
    doc.body.appendChild(c);
    card = c;
    return c;
  }

  function hide(): void {
    if (card) card.hidden = true;
    if (suppressed) {
      const saved = suppressed.getAttribute("data-ref-title");
      if (saved !== null) {
        suppressed.setAttribute("title", saved);
        suppressed.removeAttribute("data-ref-title");
      }
      suppressed = null;
    }
  }

  function show(el: HTMLElement, suppressTitle: boolean): void {
    const slug = el.getAttribute("data-ref");
    if (!slug) return;
    const data = referenceCardData(slug);
    if (!data) return;

    const c = ensureCard();
    c.textContent = "";
    const type = doc.createElement("div");
    type.className = "ref-card-type";
    const dot = doc.createElement("span");
    dot.className = "ref-card-dot";
    dot.style.background = relationTypeColor(data.type);
    type.append(dot, doc.createTextNode(relationTypeLabel(data.type)));
    const title = doc.createElement("div");
    title.className = "ref-card-title";
    title.textContent = data.title;
    c.append(type, title);
    const parts = [
      data.category ? `Category · ${data.category}` : null,
      data.usedBy > 0 ? `Used by ${data.usedBy}` : null,
    ].filter(Boolean);
    if (parts.length) {
      const ctx = doc.createElement("div");
      ctx.className = "ref-card-context";
      ctx.textContent = parts.join("   ·   ");
      c.append(ctx);
    }

    c.hidden = false;
    // Position above the link, flipping below if there is no room, and clamping
    // to the viewport's right edge. getBoundingClientRect is viewport-relative,
    // so add scroll offsets for the absolutely-positioned (document-flow) card.
    const r = el.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    const vw = win?.innerWidth ?? 1024;
    let top = r.top - cr.height - 8;
    if (top < 4) top = r.bottom + 8;
    let left = Math.min(r.left, vw - cr.width - 8);
    if (left < 4) left = 4;
    c.style.top = `${top + (win?.scrollY ?? 0)}px`;
    c.style.left = `${left + (win?.scrollX ?? 0)}px`;

    if (suppressTitle) {
      const native = el.getAttribute("title");
      if (native !== null) {
        el.setAttribute("data-ref-title", native);
        el.removeAttribute("title");
        suppressed = el;
      }
    }
  }

  function focusRef(target: EventTarget | null, suppressTitle: boolean): void {
    const el =
      target instanceof Element ? target.closest(".md-ref[data-ref]") : null;
    if (el instanceof HTMLElement) {
      if (el !== suppressed) {
        hide();
        show(el, suppressTitle);
      }
    } else {
      hide();
    }
  }

  const onOver = (e: Event) => focusRef(e.target, true);
  const onFocus = (e: Event) => focusRef(e.target, false);
  const onLeave = () => hide();

  root.addEventListener("pointerover", onOver);
  root.addEventListener("focusin", onFocus);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("focusout", onLeave);
  win?.addEventListener("scroll", onLeave, true);

  return () => {
    root.removeEventListener("pointerover", onOver);
    root.removeEventListener("focusin", onFocus);
    root.removeEventListener("pointerleave", onLeave);
    root.removeEventListener("focusout", onLeave);
    win?.removeEventListener("scroll", onLeave, true);
    hide();
    if (card?.parentNode) card.parentNode.removeChild(card);
    card = null;
  };
}
