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
import { useCart } from "../../src/drafts/useCart";
import { useSaveAnnouncements } from "../../src/drafts/useSaveAnnouncements";
import { DraftStore } from "../../src/drafts/DraftStore";
import { SubmissionCart, type CartEntry } from "../../src/drafts/SubmissionCart";

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
  // Two removals at once are two removals; "Batch cleared" and "Pull request
  // opened" are said by the actor that clears, because the diff cannot tell
  // a submit from a discard.
  assert.equal(
    describeCartChange([e("a/one.md"), e("a/two.md")], []),
    "Removed one.md and two.md from the batch",
  );
  // The delete flow re-adds the SAME path with deleted: true; membership
  // alone made that silent.
  assert.equal(
    describeCartChange([e("f/color.md")], [e("f/color.md", { deleted: true })]),
    "Staged the deletion of color.md",
  );
  assert.equal(
    describeCartChange([e("f/color.md", { deleted: true })], [e("f/color.md")]),
    "Added color.md to the batch",
  );
});

function Harness({ cart }: { cart: SubmissionCart }) {
  const entries = useCart(cart);
  useCartAnnouncements(cart, entries);
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
  // A clear is the actor's sentence ("Pull request opened", "Batch cleared"),
  // so the diff stays quiet rather than announcing a removal over it.
  await act(async () => {
    announce("Pull request opened");
    cart.clear();
  });
  assert.equal(region.textContent, "Pull request opened");
});

function SaveHarness({ store }: { store: DraftStore }) {
  useSaveAnnouncements(store, 1000);
  return <LiveRegion />;
}

test("a save is spoken when it follows a change to that file, once per quiet window per file", async () => {
  const store = new DraftStore(new MemoryStorage());
  const draft = { text: "x", basedOnSha: "", ts: 1 };
  render(<SaveHarness store={store} />);
  const seq0 = getAnnouncement().seq;
  // A save with no change before it (the snapshot on opening a drafted file,
  // a file switch) is not news.
  await act(async () => {
    store.save("b.md", draft);
  });
  assert.equal(getAnnouncement().seq, seq0, "a save with no prior change was announced");
  await act(async () => {
    store.markPending("a.md");
    store.save("a.md", draft);
  });
  assert.equal(getAnnouncement().seq, seq0 + 1);
  assert.match(getAnnouncement().text, /draft saved/i);
  // Every typing pause writes again; inside the quiet window that is noise.
  await act(async () => {
    store.markPending("a.md");
    store.save("a.md", draft);
  });
  assert.equal(getAnnouncement().seq, seq0 + 1, "a second save inside the quiet window was spoken");
  // Another file has its own window, and the flush on leaving a file is
  // just another save event with its path on it.
  await act(async () => {
    store.markPending("b.md");
    store.save("b.md", draft);
  });
  assert.equal(getAnnouncement().seq, seq0 + 2, "another file's first save was silenced");
});

test("a failed write is spoken, and the save that recovers from it is spoken regardless of the quiet window", async () => {
  const backing = new MemoryStorage();
  let fail = false;
  const storage: Storage = {
    get length() {
      return backing.length;
    },
    clear: () => backing.clear(),
    getItem: (k) => backing.getItem(k),
    key: (i) => backing.key(i),
    removeItem: (k) => backing.removeItem(k),
    setItem: (k, v) => {
      if (fail) throw new Error("QuotaExceededError");
      backing.setItem(k, v);
    },
  };
  const store = new DraftStore(storage);
  const draft = { text: "x", basedOnSha: "", ts: 1 };
  render(<SaveHarness store={store} />);
  await act(async () => {
    store.markPending("a.md");
    store.save("a.md", draft);
  });
  assert.match(getAnnouncement().text, /draft saved/i);
  const seq1 = getAnnouncement().seq;
  fail = true;
  await act(async () => {
    store.markPending("a.md");
    store.save("a.md", draft);
  });
  assert.equal(getAnnouncement().seq, seq1 + 1);
  assert.match(getAnnouncement().text, /could not be saved/i);
  // The next failed retry is not read again.
  await act(async () => {
    store.markPending("a.md");
    store.save("a.md", draft);
  });
  assert.equal(getAnnouncement().seq, seq1 + 1, "a repeated failure was announced again");
  fail = false;
  await act(async () => {
    store.markPending("a.md");
    store.save("a.md", draft);
  });
  assert.equal(getAnnouncement().seq, seq1 + 2, "the recovery was silenced by the quiet window");
  assert.match(getAnnouncement().text, /draft saved/i);
});

test("a failure is suppressed per file, and discarding the draft lifts the suppression", async () => {
  const backing = new MemoryStorage();
  let fail = true;
  const storage: Storage = {
    get length() {
      return backing.length;
    },
    clear: () => backing.clear(),
    getItem: (k) => backing.getItem(k),
    key: (i) => backing.key(i),
    removeItem: (k) => backing.removeItem(k),
    setItem: (k, v) => {
      if (fail) throw new Error("QuotaExceededError");
      backing.setItem(k, v);
    },
  };
  const store = new DraftStore(storage);
  const draft = { text: "x", basedOnSha: "", ts: 1 };
  render(<SaveHarness store={store} />);

  await act(async () => {
    store.markPending("a.md");
    store.save("a.md", draft);
  });
  const seq1 = getAnnouncement().seq;
  assert.match(getAnnouncement().text, /could not be saved/i);

  // Per PATH, not globally: suppressing every other file's first failure
  // would leave the author of b.md with a red badge and nothing spoken.
  await act(async () => {
    store.markPending("b.md");
    store.save("b.md", draft);
  });
  assert.equal(getAnnouncement().seq, seq1 + 1, "another file's failure was silenced by a.md's");

  await act(async () => {
    store.markPending("a.md");
    store.save("a.md", draft);
  });
  assert.equal(getAnnouncement().seq, seq1 + 1, "a repeated failure on the same file was read again");

  // The author discards or submits a.md. Nothing about that path survives,
  // so the next genuine failure on it must be spoken.
  await act(async () => {
    store.clear("a.md");
  });
  await act(async () => {
    store.markPending("a.md");
    store.save("a.md", draft);
  });
  assert.equal(
    getAnnouncement().seq,
    seq1 + 2,
    "a failure after the draft was discarded was silenced for good",
  );
});

test("a save with no preceding change still ends the failure it recovers from", async () => {
  // `useDraft` flushes on unmount without a fresh `pending`, so a recovery
  // can arrive with nothing in `changed`. Testing the failure first left
  // that save behind an early return: the recovery went unspoken AND the
  // path stayed suppressed, so every later failure on it was silent too.
  const backing = new MemoryStorage();
  let fail = true;
  const storage: Storage = {
    get length() {
      return backing.length;
    },
    clear: () => backing.clear(),
    getItem: (k) => backing.getItem(k),
    key: (i) => backing.key(i),
    removeItem: (k) => backing.removeItem(k),
    setItem: (k, v) => {
      if (fail) throw new Error("QuotaExceededError");
      backing.setItem(k, v);
    },
  };
  const store = new DraftStore(storage);
  const draft = { text: "x", basedOnSha: "", ts: 1 };
  render(<SaveHarness store={store} />);

  // No markPending anywhere in this test: `changed` stays empty throughout.
  await act(async () => {
    store.save("c.md", draft);
  });
  const seq = getAnnouncement().seq;
  assert.match(getAnnouncement().text, /could not be saved/i);

  fail = false;
  await act(async () => {
    store.save("c.md", draft);
  });
  assert.equal(getAnnouncement().seq, seq + 1, "the recovery was silenced because no change preceded it");
  assert.match(getAnnouncement().text, /draft saved/i);
});

test("the badge shows a failed write", () => {
  const { container } = render(
    <Theme>
      <SaveStateIndicator state={{ kind: "failed" }} />
    </Theme>,
  );
  assert.match(container.textContent ?? "", /not saved/i);
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
