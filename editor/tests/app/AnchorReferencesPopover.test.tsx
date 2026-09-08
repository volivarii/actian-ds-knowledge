import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { AnchorReferencesPopover } from "../../src/app/AnchorReferencesPopover";
import { setCachedIndexForTesting } from "../../src/lib/anchorIndex";

afterEach(() => {
  cleanup();
  setCachedIndexForTesting(null);
});

function primeIndex(slug: string, refs: string[]) {
  setCachedIndexForTesting({
    entries: new Map([
      [slug, { slug, definedIn: ["a.md"], referencedBy: refs }],
    ]),
    scannedAt: 0,
    scannedPaths: [],
    texts: new Map(),
  });
}

test("AnchorReferencesPopover: shows referencing files", () => {
  primeIndex("alpha", [
    "foundations/src/color-primitives.md",
    "accessibility/src/principles.md",
  ]);
  render(
    <Theme>
      <AnchorReferencesPopover
        slug="alpha"
        open
        onNavigate={() => {}}
        onOpenChange={() => {}}
      />
    </Theme>,
  );
  assert.ok(screen.getByText("foundations/src/color-primitives.md"));
  assert.ok(screen.getByText("accessibility/src/principles.md"));
});

test("AnchorReferencesPopover: shows '0 refs' when unused", () => {
  primeIndex("alpha", []);
  render(
    <Theme>
      <AnchorReferencesPopover
        slug="alpha"
        open
        onNavigate={() => {}}
        onOpenChange={() => {}}
      />
    </Theme>,
  );
  assert.ok(screen.getByText(/no references/i));
});

test("AnchorReferencesPopover: clicking a file dispatches onNavigate", () => {
  primeIndex("alpha", ["accessibility/src/principles.md"]);
  const calls: string[] = [];
  render(
    <Theme>
      <AnchorReferencesPopover
        slug="alpha"
        open
        onNavigate={(p) => calls.push(p)}
        onOpenChange={() => {}}
      />
    </Theme>,
  );
  fireEvent.click(screen.getByText("accessibility/src/principles.md"));
  assert.deepEqual(calls, ["accessibility/src/principles.md"]);
});

// ── #684, second surface ─────────────────────────────────────────────────────
// These rows navigate (`onClick={() => onNavigate(path)}`), so a generated
// target here is the same dead end the relations rail had: the click lands on
// the RefusalBanner, having lost the author's place.

test("AnchorReferencesPopover: generated targets are not offered as destinations", () => {
  primeIndex("alpha", [
    "foundations/src/color-primitives.md",
    "foundations/dist/foundations.bundle.json",
    "components/dist/guidelines/badge.json",
  ]);
  render(
    <Theme>
      <AnchorReferencesPopover
        slug="alpha"
        open
        onNavigate={() => {}}
        onOpenChange={() => {}}
      />
    </Theme>,
  );
  assert.ok(screen.getByText("foundations/src/color-primitives.md"));
  // Booleans, never the node: assert.equal on a DOM node serialises it into
  // the failure diff and SIGKILLs the runner, taking the whole file's results.
  assert.equal(
    screen.queryByText("foundations/dist/foundations.bundle.json") === null,
    true,
    "a dist bundle must not be a clickable destination",
  );
  assert.equal(
    screen.queryByText("components/dist/guidelines/badge.json") === null,
    true,
    "a dist guideline must not be a clickable destination",
  );
});

test("AnchorReferencesPopover: the count matches the rows it actually lists", () => {
  primeIndex("alpha", [
    "foundations/src/color-primitives.md",
    "foundations/dist/foundations.bundle.json",
  ]);
  render(
    <Theme>
      <AnchorReferencesPopover
        slug="alpha"
        open
        onNavigate={() => {}}
        onOpenChange={() => {}}
      />
    </Theme>,
  );
  // Radix renders Popover.Content in a portal, so the assertion reads the
  // document, not the render container (which is empty here).
  assert.ok(
    document.body.textContent!.includes("Referenced by 1 file"),
    `count must not advertise a row it will not render, got: ${document.body.textContent}`,
  );
});
