// F20: autosave, draft staging and validation errors were announced to nobody.
// One polite region in the header; three producers speak through it.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, act } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { announce, cartEventMessage, getAnnouncement } from "../../src/lib/announcer";
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

test("cart events become sentences naming the file, not the path", () => {
  assert.equal(
    cartEventMessage({ kind: "added", path: "content/src/patterns/forms.md" }),
    "Added forms.md to the batch",
  );
  assert.equal(
    cartEventMessage({ kind: "removed", path: "components/src/button/_meta.yml" }),
    "Removed _meta.yml for button from the batch",
  );
  assert.equal(cartEventMessage({ kind: "cleared" }), "Batch cleared");
});

test("the save-state indicator announces saving and saved, and not idle", async () => {
  const seqBefore = getAnnouncement().seq;
  const { container, rerender } = render(
    <Theme>
      <LiveRegion />
      <SaveStateIndicator state={{ kind: "idle" }} />
    </Theme>,
  );
  const region = container.querySelector('[aria-live="polite"]')!;
  // The announcer is one module-level channel, so the region may still carry
  // the previous test's sentence. "Idle says nothing" is therefore asserted
  // on the sequence, not on emptiness.
  assert.equal(getAnnouncement().seq, seqBefore, "idle announced something");
  await act(async () => {
    rerender(
      <Theme>
        <LiveRegion />
        <SaveStateIndicator state={{ kind: "saving" }} />
      </Theme>,
    );
  });
  assert.match(region.textContent ?? "", /saving/i);
  await act(async () => {
    rerender(
      <Theme>
        <LiveRegion />
        <SaveStateIndicator state={{ kind: "saved", savedAt: Date.now() }} />
      </Theme>,
    );
  });
  assert.match(region.textContent ?? "", /draft saved/i);
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
