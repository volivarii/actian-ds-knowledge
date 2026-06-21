import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAppContextFile,
  isCategoryFile,
  shouldUseWysiwyg,
} from "../../src/lib/wysiwygPaths";

test("isAppContextFile matches only per-record app-context markdown", () => {
  assert.equal(isAppContextFile("app-context/src/apps/studio.md"), true);
  assert.equal(
    isAppContextFile("app-context/src/entities/data-product.md"),
    true,
  );
  assert.equal(
    isAppContextFile("app-context/src/patterns/import-wizard.md"),
    true,
  );
  // Non-records under the app-context prefix — the `startsWith` bug class.
  assert.equal(isAppContextFile("app-context/dist/app-context.json"), false);
  assert.equal(isAppContextFile("app-context/CONSUMING.md"), false);
  assert.equal(isAppContextFile("app-context/src/terminology.yml"), false);
  assert.equal(isAppContextFile("app-context/src/apps/sub/deep.md"), false);
});

test("isCategoryFile matches only category records (not AUTHORING or nested)", () => {
  assert.equal(isCategoryFile("components/src/categories/action.md"), true);
  assert.equal(
    isCategoryFile("components/src/categories/form-input-selection.md"),
    true,
  );
  assert.equal(isCategoryFile("components/src/categories/AUTHORING.md"), false);
  assert.equal(isCategoryFile("components/src/categories/sub/x.md"), false);
  assert.equal(isCategoryFile("components/src/button/content.md"), false);
  assert.equal(isCategoryFile("components/dist/categories/action.md"), false);
});

test("shouldUseWysiwyg requires the flag AND an app-context OR category record", () => {
  globalThis.sessionStorage.clear();
  // Flag off → never, even for a real record.
  assert.equal(shouldUseWysiwyg("app-context/src/apps/studio.md"), false);
  assert.equal(shouldUseWysiwyg("components/src/categories/action.md"), false);
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  // Flag on + per-record path → yes (both domains).
  assert.equal(shouldUseWysiwyg("app-context/src/apps/studio.md"), true);
  assert.equal(shouldUseWysiwyg("app-context/src/entities/x.md"), true);
  assert.equal(shouldUseWysiwyg("components/src/categories/action.md"), true);
  // Flag on but NOT a per-record path → no.
  assert.equal(shouldUseWysiwyg("app-context/dist/app-context.json"), false);
  assert.equal(shouldUseWysiwyg("app-context/CONSUMING.md"), false);
  assert.equal(shouldUseWysiwyg("components/src/categories/AUTHORING.md"), false);
  assert.equal(shouldUseWysiwyg("components/src/button/content.md"), false);
  assert.equal(shouldUseWysiwyg("foundations/src/x.md"), false);
  globalThis.sessionStorage.clear();
});
