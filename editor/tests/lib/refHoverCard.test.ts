// The inline reference hover-preview card controller: delegated on a root, it
// shows a floating card (title + type + graph context) when a .md-ref link is
// hovered/focused, and hides on leave. One controller covers both rendered
// surfaces (preview + rich mode) since both emit .md-ref[data-ref] DOM.
import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { installRefHoverCard } from "../../src/lib/refHoverCard";

function link(slug: string, text = "x"): HTMLElement {
  const a = document.createElement("a");
  a.className = "md-ref";
  a.setAttribute("data-ref", slug);
  a.setAttribute("data-node-type", "component");
  a.setAttribute("title", "Component");
  a.textContent = text;
  return a;
}
function over(el: Element) {
  el.dispatchEvent(new Event("pointerover", { bubbles: true }));
}

test("hovering a component reference link shows a card with its title, type, and context", () => {
  const root = document.createElement("div");
  const a = link("button", "button");
  const plain = document.createElement("span");
  plain.textContent = "prose";
  root.append(a, plain);
  document.body.append(root);
  const cleanup = installRefHoverCard(root);

  over(a);
  const card = document.querySelector(".ref-hover-card") as HTMLElement;
  assert.ok(card && !card.hidden, "card is shown");
  assert.ok(card.textContent!.includes("Button"), "shows the title");
  assert.ok(card.textContent!.includes("Component"), "shows the type");
  assert.ok(card.textContent!.includes("Action"), "shows the category context");
  // the native title is suppressed while the card is up (no double tooltip)
  assert.equal(a.getAttribute("title"), null);

  // moving onto plain prose hides the card and restores the title
  over(plain);
  assert.ok(card.hidden, "card hidden after leaving the link");
  assert.equal(a.getAttribute("title"), "Component", "native title restored");

  cleanup();
  assert.equal(document.querySelector(".ref-hover-card"), null, "cleanup removes the card");
  document.body.removeChild(root);
});

test("a link whose ref does not resolve shows no card", () => {
  const root = document.createElement("div");
  const a = link("nonexistent-xyz", "x");
  root.append(a);
  document.body.append(root);
  const cleanup = installRefHoverCard(root);
  over(a);
  const card = document.querySelector(".ref-hover-card") as HTMLElement | null;
  assert.ok(!card || card.hidden, "no card for an unresolved ref");
  cleanup();
  document.body.removeChild(root);
});
