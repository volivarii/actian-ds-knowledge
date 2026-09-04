// F20: autosave, draft staging and validation errors were announced to nobody.
// One polite region in the header; three producers speak through it.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, act } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { announce, describeCartChange, getAnnouncement } from "../../src/lib/announcer";
import { useCartAnnouncements } from "../../src/drafts/useCartAnnouncements";
import { SubmissionCart, type CartEntry } from "../../src/drafts/SubmissionCart";
import type { SaveState } from "../../src/drafts/useSaveState";

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
import { LiveRegion } from "../../src/app/LiveRegion";
import { SaveStateIndicator } from "../../src/app/SaveStateIndicator";

afterEach(cleanup);

test("an announcement reaches the polite live region, and the next replaces it", async () => {
  const { container } = render(<LiveRegion />);
  const region = container.querySelector('[aria-live="polite"]');
  assert.ok(region, "no polite region rendered");
  await act(async () => announce("Draft saved"));
  assert.equal(region.textContent, "Draft saved");
  await act(async () => announce("Added forms.md to the batch"));
  assert.equal(region.textContent, "Added forms.md to the batch");
});

test("a cart change becomes one sentence naming files, not paths", () => {
  const e = (path: string, extra: Partial<CartEntry> = {}): CartEntry => ({
    path,
    content: "",
    basedOnSha: "",
    addedAt: 0,
    ...extra,
  });
  assert.equal(
    describeCartChange([], [e("content/src/patterns/forms.md")]),
    "Added forms.md to the batch",
  );
  // A replaced entry (every debounced autosave calls add()) is not news.
  const same = e("content/src/patterns/forms.md");
  assert.equal(describeCartChange([same], [{ ...same, content: "x" }]), null);
  assert.equal(
    describeCartChange([e("components/src/button/_meta.yml")], []),
    "Removed _meta.yml for button from the batch",
  );
  assert.equal(
    describeCartChange([], [e("foundations/src/color.md", { deleted: true })]),
    "Staged the deletion of color.md",
  );
  assert.equal(
    describeCartChange([], [e("foundations/src/_order.json")]),
    "Added the foundations section order to the batch",
  );
  // A burst in one commit is one sentence, not the last of several.
  assert.equal(
    describeCartChange([], [e("a/b/one.md"), e("a/b/two.md")]),
    "Added one.md and two.md to the batch",
  );
  assert.equal(describeCartChange([e("a/one.md"), e("a/two.md")], []), "Batch cleared");
});

function Harness({ cart }: { cart: SubmissionCart }) {
  useCartAnnouncements(cart);
  return <LiveRegion />;
}

test("the cart hook speaks one sentence per commit, through the live region", async () => {
  const cart = new SubmissionCart(new MemoryStorage());
  const { container } = render(<Harness cart={cart} />);
  const region = container.querySelector('[aria-live="polite"]')!;
  await act(async () => {
    cart.add({ path: "x/one.md", content: "", basedOnSha: "", addedAt: 0 });
    cart.add({ path: "x/two.md", content: "", basedOnSha: "", addedAt: 0 });
  });
  assert.equal(region.textContent, "Added one.md and two.md to the batch");
  // The autosave re-add of an entry already in the batch says nothing new.
  await act(async () => {
    cart.add({ path: "x/one.md", content: "typed", basedOnSha: "", addedAt: 1 });
  });
  assert.equal(region.textContent, "Added one.md and two.md to the batch");
});

test("the save-state indicator announces a real save once, never on opening a draft", async () => {
  const seqBefore = getAnnouncement().seq;
  // Opening a file that already has a draft starts at "saved" with no write.
  const { container, rerender } = render(
    <Theme>
      <LiveRegion />
      <SaveStateIndicator state={{ kind: "saved", savedAt: 1 }} />
    </Theme>,
  );
  const region = container.querySelector('[aria-live="polite"]')!;
  assert.equal(getAnnouncement().seq, seqBefore, "opening a drafted file announced a save");
  const show = async (state: SaveState) =>
    act(async () => {
      rerender(
        <Theme>
          <LiveRegion />
          <SaveStateIndicator state={state} />
        </Theme>,
      );
    });
  await show({ kind: "unsaved" });
  await show({ kind: "saved", savedAt: 2 });
  assert.match(region.textContent ?? "", /draft saved/i);
  const afterFirst = getAnnouncement().seq;
  // Every typing pause writes again. That is not news a minute later, let
  // alone every second.
  await show({ kind: "unsaved" });
  await show({ kind: "saved", savedAt: 3 });
  assert.equal(getAnnouncement().seq, afterFirst, "a second save inside the quiet window was announced");
});

test("a write that never reports saved is announced as a failure", async () => {
  // DraftStore emits writing and saved synchronously, so a committed "saving"
  // state only ever means the write threw (storage quota) and "saved" never
  // came. The badge used to sit on "Saving…" forever and say nothing.
  const { container, rerender } = render(
    <Theme>
      <LiveRegion />
      <SaveStateIndicator state={{ kind: "unsaved" }} failureAfterMs={30} />
    </Theme>,
  );
  const region = container.querySelector('[aria-live="polite"]')!;
  await act(async () => {
    rerender(
      <Theme>
        <LiveRegion />
        <SaveStateIndicator state={{ kind: "saving" }} failureAfterMs={30} />
      </Theme>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });
  assert.match(region.textContent ?? "", /could not be saved/i);
});

test("announcing the same sentence twice replaces the node, so it is read again", async () => {
  // aria-live only speaks on a DOM change. "Draft saved" after "Draft saved"
  // with the text node left in place would be heard once, on the first save.
  const { container } = render(<LiveRegion />);
  const region = container.querySelector('[aria-live="polite"]')!;
  await act(async () => announce("Draft saved"));
  const first = region.firstElementChild;
  assert.ok(first);
  await act(async () => announce("Draft saved"));
  assert.equal(region.textContent, "Draft saved");
  assert.notEqual(region.firstElementChild, first, "the same node was reused");
});
