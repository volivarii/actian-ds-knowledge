// Tests for RefStore abstraction (Step 5).
// FrontmatterRefStore dispatches to the correct underlying writer:
//   - object-ref fields (a11y_refs, motion_refs, foundations_refs) →
//     addRefToFrontmatter / removeRefFromFrontmatter
//   - flat-array fields (relatedComponents) →
//     addFlatRefToFrontmatter / removeFlatRefFromFrontmatter

import { test } from "node:test";
import assert from "node:assert/strict";
import { FrontmatterRefStore } from "../../src/substrate/refStore";

const EMPTY_SOURCE = `---
title: My section
---

## Section
`;

const SOURCE_WITH_A11Y = `---
a11y_refs:
  - { ref: color-contrast }
---

## Section
`;

const SOURCE_WITH_RELATED = `---
relatedComponents: [button, input]
---

## Section
`;

// ── addRef ───────────────────────────────────────────────────────────────────

test("FrontmatterRefStore: addRef for a11y_refs writes object-ref block", () => {
  const store = new FrontmatterRefStore(EMPTY_SOURCE);
  const result = store.addRef("a11y_refs", "color-contrast", null);
  assert.match(result, /a11y_refs:/);
  assert.match(result, /ref: color-contrast/);
  assert.doesNotMatch(result, /relatedComponents/);
});

test("FrontmatterRefStore: addRef for motion_refs writes object-ref block", () => {
  const store = new FrontmatterRefStore(EMPTY_SOURCE);
  const result = store.addRef("motion_refs", "state-transitions", null);
  assert.match(result, /motion_refs:/);
  assert.match(result, /ref: state-transitions/);
});

test("FrontmatterRefStore: addRef for foundations_refs writes object-ref block", () => {
  const store = new FrontmatterRefStore(EMPTY_SOURCE);
  const result = store.addRef("foundations_refs", "tokens", null);
  assert.match(result, /foundations_refs:/);
  assert.match(result, /ref: tokens/);
});

test("FrontmatterRefStore: addRef for relatedComponents writes flat-array", () => {
  const store = new FrontmatterRefStore(EMPTY_SOURCE);
  const result = store.addRef("relatedComponents", "badge", null);
  assert.match(result, /relatedComponents: \[badge\]/);
  assert.doesNotMatch(result, /ref:/);
});

test("FrontmatterRefStore: addRef for relatedComponents appends to existing list", () => {
  const store = new FrontmatterRefStore(SOURCE_WITH_RELATED);
  const result = store.addRef("relatedComponents", "badge", null);
  assert.match(result, /relatedComponents: \[button, input, badge\]/);
});

// ── removeRef ────────────────────────────────────────────────────────────────

test("FrontmatterRefStore: removeRef for a11y_refs uses object-ref remover", () => {
  const store = new FrontmatterRefStore(SOURCE_WITH_A11Y);
  const result = store.removeRef("a11y_refs", "color-contrast");
  assert.doesNotMatch(result, /ref: color-contrast/);
});

test("FrontmatterRefStore: removeRef for relatedComponents uses flat remover", () => {
  const store = new FrontmatterRefStore(SOURCE_WITH_RELATED);
  const result = store.removeRef("relatedComponents", "button");
  assert.match(result, /relatedComponents: \[input\]/);
  assert.doesNotMatch(result, /button/);
});

test("FrontmatterRefStore: removeRef relatedComponents last slug drops key", () => {
  const source = `---
relatedComponents: [badge]
---

## Section
`;
  const store = new FrontmatterRefStore(source);
  const result = store.removeRef("relatedComponents", "badge");
  assert.doesNotMatch(result, /relatedComponents/);
});
