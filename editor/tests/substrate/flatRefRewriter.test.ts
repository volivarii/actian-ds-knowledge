// Tests for the flat-array frontmatter writer (Step 4).
// Covers addFlatRefToFrontmatter / removeFlatRefFromFrontmatter for
// the `relatedComponents` field (and any other flat-array ref field).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addFlatRefToFrontmatter,
  removeFlatRefFromFrontmatter,
} from "../../src/substrate/flatRefRewriter";

// ── addFlatRefToFrontmatter ──────────────────────────────────────────────────

test("flatRefRewriter: add slug to existing relatedComponents list", () => {
  const source = `---
relatedComponents: [button, input]
---

## Section
`;
  const result = addFlatRefToFrontmatter(source, "relatedComponents", "badge");
  assert.match(result, /relatedComponents: \[button, input, badge\]/);
});

test("flatRefRewriter: add slug when relatedComponents field is absent", () => {
  const source = `---
title: My section
---

## Section
`;
  const result = addFlatRefToFrontmatter(source, "relatedComponents", "badge");
  assert.match(result, /relatedComponents: \[badge\]/);
  // Should be inside the frontmatter envelope
  assert.match(result, /^---\n/);
  assert.match(result, /---\n\n## Section/);
});

test("flatRefRewriter: add is idempotent (no duplicate slug)", () => {
  const source = `---
relatedComponents: [button, input]
---

## Section
`;
  const result = addFlatRefToFrontmatter(source, "relatedComponents", "button");
  assert.match(result, /relatedComponents: \[button, input\]/);
  assert.doesNotMatch(result, /button, button/);
});

// ── removeFlatRefFromFrontmatter ─────────────────────────────────────────────

test("flatRefRewriter: remove a slug from the middle of the list", () => {
  const source = `---
relatedComponents: [button, input, badge]
---

## Section
`;
  const result = removeFlatRefFromFrontmatter(
    source,
    "relatedComponents",
    "input",
  );
  assert.match(result, /relatedComponents: \[button, badge\]/);
});

test("flatRefRewriter: remove the last slug drops the key entirely", () => {
  const source = `---
relatedComponents: [button]
---

## Section
`;
  const result = removeFlatRefFromFrontmatter(
    source,
    "relatedComponents",
    "button",
  );
  assert.doesNotMatch(result, /relatedComponents/);
});

test("flatRefRewriter: remove a slug not in the list leaves source unchanged", () => {
  const source = `---
relatedComponents: [button, input]
---

## Section
`;
  const result = removeFlatRefFromFrontmatter(
    source,
    "relatedComponents",
    "badge",
  );
  assert.equal(result, source);
});
