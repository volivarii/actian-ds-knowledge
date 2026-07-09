import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";
import { assembleFrontmatterFile } from "../../src/app/FrontmatterBodyEditScreen";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";

test("a content writing file routes to the generic content form", () => {
  const m = matchFrontmatterForm("content/src/patterns/forms.md");
  assert.equal(m?.schemaKey, "content");
  // generic form hides the field outright, not the WTA grid config (which
  // carries "ui:options" + per-row "items")
  assert.equal(m?.uiSchema.wordsToAvoid?.["ui:widget"], "hidden");
  assert.equal(m?.uiSchema.wordsToAvoid?.items, undefined);
});

test("words-to-avoid still wins over the generic content entry", () => {
  const m = matchFrontmatterForm("content/src/writing/words-to-avoid.md");
  assert.ok(m?.uiSchema.wordsToAvoid); // specific entry matched first
});

test("hidden nav fields survive a form serialize round-trip", () => {
  const data = {
    title: "Forms",
    nav_order: 14,
    relatedComponents: ["input", "checkbox-with-label"],
    nav_exclude: true,
  };
  const original = 'title: "Forms"\nnav_order: 14\n';
  const out = assembleFrontmatterFile(data, original, "Body text.\n");
  const reparsed = splitFrontmatter(out);
  assert.deepEqual(reparsed.data, data); // nav_order + nav_exclude preserved
});
