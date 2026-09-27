import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { AddSectionDialog } from "../../src/app/AddSectionDialog";
import { DeleteSectionDialog } from "../../src/app/DeleteSectionDialog";

afterEach(cleanup);

// Extended forbidden list — includes file-path tokens which are off-limits
// outside elements explicitly marked `data-detail="path"` (the doctrine
// escape hatch for showing concrete .md / _order.json paths to power users).
const DIALOG_FORBIDDEN_TOKENS = [
  "slug",
  "ref:",
  "a11y_refs",
  "motion_refs",
  "foundations_refs",
  "relatedComponents",
  "frontmatter",
  "_order.json",
  ".md",
];

// Pluck out any element marked `data-detail="path"` from the rendered
// portal content before scanning — these are the allowed exceptions.
// Dialogs render into a portal under document.body — scan the body, not the
// test container. Clones first to avoid mutating the live DOM.
function gatherTextExcludingPathDetails(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  for (const node of Array.from(
    clone.querySelectorAll('[data-detail="path"]'),
  )) {
    node.remove();
  }
  return clone.textContent ?? "";
}

test("doctrine: AddSectionDialog renders no forbidden vocabulary outside data-detail elements", () => {
  render(
    <Theme>
      <AddSectionDialog
        open
        domain="foundations"
        pathPrefix="foundations/src"
        existingSlugs={[]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  const text = gatherTextExcludingPathDetails().toLowerCase();
  for (const token of DIALOG_FORBIDDEN_TOKENS) {
    assert.ok(
      !text.includes(token.toLowerCase()),
      `AddSectionDialog UI must not include "${token}" outside data-detail elements`,
    );
  }
});

test("doctrine: DeleteSectionDialog (refCount=0) renders no forbidden vocabulary outside data-detail elements", () => {
  render(
    <Theme>
      <DeleteSectionDialog
        open
        slug="tokens"
        title="Tokens"
        domain="foundations"
        refCount={0}
        sampleRefs={[]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  const text = gatherTextExcludingPathDetails().toLowerCase();
  for (const token of DIALOG_FORBIDDEN_TOKENS) {
    assert.ok(
      !text.includes(token.toLowerCase()),
      `DeleteSectionDialog (no refs) UI must not include "${token}" outside data-detail elements`,
    );
  }
});

test("doctrine: DeleteSectionDialog (refCount>=1) renders no forbidden vocabulary outside data-detail elements (sample refs allowed inside)", () => {
  render(
    <Theme>
      <DeleteSectionDialog
        open
        slug="tokens"
        title="Tokens"
        domain="foundations"
        refCount={3}
        sampleRefs={[
          "components/dist/guidelines/button.json",
          "foundations/src/design-guidelines.md",
        ]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  const text = gatherTextExcludingPathDetails().toLowerCase();
  for (const token of DIALOG_FORBIDDEN_TOKENS) {
    assert.ok(
      !text.includes(token.toLowerCase()),
      `DeleteSectionDialog (with refs) UI must not include "${token}" outside data-detail elements`,
    );
  }
});
