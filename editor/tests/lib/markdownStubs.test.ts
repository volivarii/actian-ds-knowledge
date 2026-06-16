import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMarkdownStub } from "../../src/lib/markdownStubs";

test("design stub scaffolds the 5 canonical sections with governed anchors", () => {
  const out = buildMarkdownStub("components/src/button/design.md");
  assert.match(out, /^# Button — Design/);
  assert.match(out, /## Anatomy \{#anatomy\}/);
  assert.match(out, /## Variants \{#variants\}/);
  assert.match(out, /## Spacing & size \{#spacing-and-size\}/);
  assert.match(out, /## Behavior \{#behavior\}/);
  assert.match(out, /## Layout \{#layout\}/);
});

test("content stub scaffolds the editorial content sections WITHOUT anchors", () => {
  const out = buildMarkdownStub("components/src/button/content.md");
  assert.match(out, /^# Button — Content/);
  assert.match(out, /## When to use(?!.*\{#)/);
  assert.match(out, /## Style/);
  assert.match(out, /## Do \/ Don't/);
  // editorial domains must NOT scaffold {#anchor} (only design anchors are governed)
  assert.equal(/\{#/.test(out), false, "no anchors in content stub");
});

test("usage + behavior stubs scaffold their editorial sections", () => {
  assert.match(buildMarkdownStub("components/src/tag/usage.md"), /## When to use/);
  assert.match(buildMarkdownStub("components/src/tag/behavior.md"), /## Keyboard interaction/);
});

test("tokens domain keeps a minimal stub (no prose sections)", () => {
  const out = buildMarkdownStub("components/src/button/tokens.md");
  assert.match(out, /^# Button — Tokens/);
  assert.equal(/^## /m.test(out), false, "no scaffolded sections for tokens");
});

test("category + generic stubs are unchanged (minimal)", () => {
  assert.match(buildMarkdownStub("components/src/categories/action.md"), /category defaults/);
  assert.match(buildMarkdownStub("foundations/src/color.md"), /^# Color/);
});
