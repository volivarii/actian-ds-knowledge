import test from "node:test";
import assert from "node:assert/strict";
import { isCategoryFile, isPlainMarkdown } from "../../src/app/EditorShell";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";

test("isCategoryFile matches only category md files", () => {
  assert.equal(isCategoryFile("components/src/categories/action.md"), true);
  assert.equal(
    isCategoryFile("components/src/categories/data-display.md"),
    true,
  );
  assert.equal(isCategoryFile("components/src/button/content.md"), false);
  assert.equal(isCategoryFile("components/src/categories/AUTHORING.md"), false);
});

test("isPlainMarkdown no longer claims category files", () => {
  assert.equal(isPlainMarkdown("components/src/categories/action.md"), false);
  // foundations files are form-routed (Task 3), not plain-markdown
  assert.equal(isPlainMarkdown("foundations/src/color.md"), false);
  assert.equal(
    matchFrontmatterForm("foundations/src/color.md")?.schemaKey,
    "foundations",
  );
});
