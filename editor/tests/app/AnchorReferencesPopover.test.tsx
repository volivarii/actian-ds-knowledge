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

// ── Review finding: the popover states a flat falsehood for anchors whose
// only indexed referrers are generated ─────────────────────────────────────
//
// `#truncation-overflow` in accessibility/src/components.md is consumed by ten
// component guidelines. Every one of them reaches the index as
// `components/dist/guidelines/*.json`, because the index scans .md and dist
// JSON and never `_meta.yml`. Filtering for navigation without changing the
// count made the popover say "No references in the substrate."

test("AnchorReferencesPopover: an anchor referenced only from generated files is not called unreferenced", () => {
  primeIndex("truncation-overflow", [
    "components/dist/guidelines/card.json",
    "components/dist/guidelines/table.json",
    "components/dist/guidelines/tag.json",
  ]);
  render(
    <Theme>
      <AnchorReferencesPopover
        slug="truncation-overflow"
        open
        onNavigate={() => {}}
        onOpenChange={() => {}}
      />
    </Theme>,
  );
  const txt = document.body.textContent!;
  assert.equal(
    /No references in the substrate/.test(txt),
    false,
    `three files reference it; the popover must not say none: ${txt}`,
  );
  assert.ok(
    /3 generated files reference this/.test(txt),
    `it must say what does reference it, got: ${txt}`,
  );
});

test("AnchorReferencesPopover: a genuinely unreferenced anchor still says so", () => {
  primeIndex("orphan-anchor", []);
  render(
    <Theme>
      <AnchorReferencesPopover
        slug="orphan-anchor"
        open
        onNavigate={() => {}}
        onOpenChange={() => {}}
      />
    </Theme>,
  );
  assert.ok(
    /No references in the substrate/.test(document.body.textContent!),
    "the honest empty state survives",
  );
});

test("AnchorReferencesPopover: the generated note follows the clickable list, not precedes it", () => {
  // Above the list, a sentence about files you cannot open reads as a caption
  // for the one you can. RelationsPanel places it after the rows; these two
  // siblings should agree.
  primeIndex("alpha", [
    "content/src/patterns/forms.md",
    "components/dist/guidelines/card.json",
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
  const txt = document.body.textContent!;
  const noteAt = txt.indexOf("1 generated file also references this");
  const rowAt = txt.indexOf("content/src/patterns/forms.md");
  assert.ok(noteAt >= 0 && rowAt >= 0, `both must render: ${txt}`);
  assert.ok(
    rowAt < noteAt,
    `the clickable row must come before the note about what was withheld: ${txt}`,
  );
});
