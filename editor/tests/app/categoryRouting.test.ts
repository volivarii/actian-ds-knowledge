import test from "node:test";
import assert from "node:assert/strict";
import { isCategoryFile, isPlainMarkdown } from "../../src/app/EditorShell";

test("isCategoryFile matches only category md files", () => {
  assert.equal(isCategoryFile("components/src/categories/action.md"), true);
  assert.equal(isCategoryFile("components/src/categories/data-display.md"), true);
  assert.equal(isCategoryFile("components/src/button/content.md"), false);
  assert.equal(isCategoryFile("components/src/categories/AUTHORING.md"), false);
});

test("isPlainMarkdown no longer claims category files", () => {
  assert.equal(isPlainMarkdown("components/src/categories/action.md"), false);
  // a non-category authored markdown still routes to the plain editor
  assert.equal(isPlainMarkdown("foundations/src/color.md"), true);
});
