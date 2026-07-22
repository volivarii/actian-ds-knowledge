import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installAnchorChipRename } from "../../src/lib/anchorChipRename";

const doc = globalThis.document;

afterEach(() => {
  doc.body.innerHTML = "";
});

test("installAnchorChipRename: a chip click fires onClick with the slug + element", () => {
  const root = doc.createElement("div");
  const chip = doc.createElement("span");
  chip.setAttribute("data-anchor-slug", "overview");
  // A nested child, so the delegated listener must walk up via closest().
  const inner = doc.createElement("b");
  chip.appendChild(inner);
  root.appendChild(chip);
  doc.body.appendChild(root);

  const calls: Array<[string, HTMLElement]> = [];
  const cleanup = installAnchorChipRename(root, (slug, el) =>
    calls.push([slug, el]),
  );

  inner.dispatchEvent(new globalThis.Event("click", { bubbles: true }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]![0], "overview");
  assert.equal(calls[0]![1], chip);

  cleanup();
  inner.dispatchEvent(new globalThis.Event("click", { bubbles: true }));
  assert.equal(calls.length, 1, "no fire after cleanup");
});

test("installAnchorChipRename: clicks outside any chip do nothing", () => {
  const root = doc.createElement("div");
  const other = doc.createElement("span");
  root.appendChild(other);
  doc.body.appendChild(root);

  const calls: string[] = [];
  installAnchorChipRename(root, (slug) => calls.push(slug));
  other.dispatchEvent(new globalThis.Event("click", { bubbles: true }));
  assert.equal(calls.length, 0);
});
