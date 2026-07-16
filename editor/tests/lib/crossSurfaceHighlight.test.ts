// The coordinated highlight: hovering (or focusing) any element carrying a
// data-ref lights every element in the same root that shares that ref, so an
// inline typed link and its matching relations-rail row highlight together.
// Delegated on a root element, so it covers dynamically re-rendered content
// (the rail and preview repaint as the doc changes).
import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { installCrossSurfaceHighlight } from "../../src/lib/crossSurfaceHighlight";

function ref(slug: string | null, text = ""): HTMLElement {
  const el = document.createElement("span");
  if (slug !== null) el.setAttribute("data-ref", slug);
  el.textContent = text;
  return el;
}

function over(el: HTMLElement) {
  el.dispatchEvent(new Event("pointerover", { bubbles: true }));
}

test("hovering a ref lights every element sharing that ref, not others", () => {
  const root = document.createElement("div");
  const table1 = ref("table", "in prose");
  const table2 = ref("table", "in rail");
  const modal = ref("modal", "other");
  const plain = ref(null, "text");
  root.append(table1, table2, modal, plain);
  document.body.append(root);
  const cleanup = installCrossSurfaceHighlight(root);

  over(table1);
  assert.ok(table1.classList.contains("rel-hot"), "hovered element lit");
  assert.ok(table2.classList.contains("rel-hot"), "sibling with same ref lit");
  assert.ok(!modal.classList.contains("rel-hot"), "different ref not lit");

  // moving onto a plain (ref-less) element clears the highlight
  over(plain);
  assert.ok(!table1.classList.contains("rel-hot"));
  assert.ok(!table2.classList.contains("rel-hot"));

  cleanup();
  document.body.removeChild(root);
});

test("hovering a child of a ref element resolves to the ancestor ref", () => {
  const root = document.createElement("div");
  const row = ref("table", "");
  const dot = document.createElement("span");
  row.append(dot);
  const mirror = ref("table", "elsewhere");
  root.append(row, mirror);
  document.body.append(root);
  const cleanup = installCrossSurfaceHighlight(root);

  over(dot); // child of the ref row
  assert.ok(row.classList.contains("rel-hot"));
  assert.ok(mirror.classList.contains("rel-hot"));

  cleanup();
  document.body.removeChild(root);
});

test("cleanup removes the listeners and clears any active highlight", () => {
  const root = document.createElement("div");
  const a = ref("x", "a");
  root.append(a);
  document.body.append(root);
  const cleanup = installCrossSurfaceHighlight(root);

  over(a);
  assert.ok(a.classList.contains("rel-hot"));
  cleanup();
  assert.ok(!a.classList.contains("rel-hot"), "cleanup clears the highlight");
  over(a);
  assert.ok(!a.classList.contains("rel-hot"), "no highlight after cleanup");
  document.body.removeChild(root);
});
