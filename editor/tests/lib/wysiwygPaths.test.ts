import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAppContextFile,
  isCategoryFile,
  isWysiwygSafePath,
  isWordsToAvoidFile,
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

test("isWordsToAvoidFile matches only the single words-to-avoid source file", () => {
  assert.equal(
    isWordsToAvoidFile("content/src/writing/words-to-avoid.md"),
    true,
  );
  assert.equal(
    isWordsToAvoidFile("content/src/writing/capitalization.md"),
    false,
  );
  assert.equal(isWordsToAvoidFile("content/dist/words-to-avoid.json"), false);
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
  // Flag on + registry-safe component guideline (slice 3) → yes.
  assert.equal(shouldUseWysiwyg("components/src/button/content.md"), true);
  // Flag on but NOT a per-record path → no.
  assert.equal(shouldUseWysiwyg("app-context/dist/app-context.json"), false);
  assert.equal(shouldUseWysiwyg("app-context/CONSUMING.md"), false);
  assert.equal(
    shouldUseWysiwyg("components/src/categories/AUTHORING.md"),
    false,
  );
  // Slice 4 recovered button/behavior + button/design (<Media> allowlist) → eligible.
  assert.equal(shouldUseWysiwyg("components/src/button/behavior.md"), true);
  assert.equal(shouldUseWysiwyg("components/src/button/design.md"), true);
  // Dropped stragglers stay CodeMirror (link/table — sections/escape drift, slice 4 tail).
  assert.equal(shouldUseWysiwyg("components/src/link/content.md"), false);
  assert.equal(shouldUseWysiwyg("foundations/src/x.md"), false);
  globalThis.sessionStorage.clear();
});

test("isWysiwygSafePath — true for the registry's safe paths across domains", () => {
  assert.equal(isWysiwygSafePath("foundations/src/design-guidelines.md"), true);
  assert.equal(isWysiwygSafePath("accessibility/src/color-contrast.md"), true);
  assert.equal(isWysiwygSafePath("content/src/global-guidelines.md"), true);
  assert.equal(isWysiwygSafePath("content/src/patterns/forms.md"), true);
  // Slice 3 — component guideline content + design kinds.
  assert.equal(isWysiwygSafePath("components/src/button/content.md"), true);
  assert.equal(isWysiwygSafePath("components/src/text-input/design.md"), true);
  assert.equal(
    isWysiwygSafePath("components/src/chat-with-ai-steward/usage.md"),
    true,
  );
  // Slice 4 — guard refinement recovered <Media>/inline-code + behavior.md.
  assert.equal(isWysiwygSafePath("components/src/button/design.md"), true);
  assert.equal(isWysiwygSafePath("components/src/button/behavior.md"), true);
  assert.equal(isWysiwygSafePath("accessibility/src/aria-labels.md"), true);
  assert.equal(isWysiwygSafePath("accessibility/src/components.md"), true);
});

test("isWysiwygSafePath — false for files NOT in the registry", () => {
  assert.equal(isWysiwygSafePath("foundations/src/tokens.md"), false);
  // color-primitives stays out — section-dist drift (bare `*` escaped in italic cell).
  assert.equal(isWysiwygSafePath("foundations/src/color-primitives.md"), false);
  assert.equal(
    isWysiwygSafePath("content/src/writing/words-to-avoid.md"),
    false,
  );
  assert.equal(isWysiwygSafePath("content/src/AUTHORING.md"), false);
  // Dropped stragglers stay out (slice 4 tail — non-idempotent / sections drift).
  assert.equal(isWysiwygSafePath("components/src/link/content.md"), false);
  assert.equal(isWysiwygSafePath("components/src/table/content.md"), false);
  assert.equal(
    isWysiwygSafePath("components/src/text-input/content.md"),
    false,
  );
});

test("shouldUseWysiwyg includes registry-safe content/a11y files when flagged", () => {
  globalThis.sessionStorage.clear();
  assert.equal(shouldUseWysiwyg("accessibility/src/color-contrast.md"), false);
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  assert.equal(shouldUseWysiwyg("accessibility/src/color-contrast.md"), true);
  assert.equal(shouldUseWysiwyg("content/src/global-guidelines.md"), true);
  assert.equal(
    shouldUseWysiwyg("content/src/writing/words-to-avoid.md"),
    false,
  );
  // Slice 4 recovered aria-labels (inline-code/<Media>-aware fail-closed).
  assert.equal(shouldUseWysiwyg("accessibility/src/aria-labels.md"), true);
  globalThis.sessionStorage.clear();
});
