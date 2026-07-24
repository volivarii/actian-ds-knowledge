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
import { setWysiwygFlag } from "../helpers/editorSurface";

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
  setWysiwygFlag("source");
  // Flag off → never, even for a real record.
  assert.equal(shouldUseWysiwyg("app-context/src/apps/studio.md"), false);
  assert.equal(shouldUseWysiwyg("components/src/categories/action.md"), false);
  setWysiwygFlag("rich");
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
  // Slice 7 recovered link/content (backtick-wrapped URL → no autolink drift) → eligible.
  assert.equal(shouldUseWysiwyg("components/src/link/content.md"), true);
  assert.equal(shouldUseWysiwyg("foundations/src/x.md"), false);
  setWysiwygFlag("source");
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
  // Slice 5 — foundations escapes (tokens empty-cell → —; color-primitives `\*` accepted).
  assert.equal(isWysiwygSafePath("foundations/src/tokens.md"), true);
  assert.equal(isWysiwygSafePath("foundations/src/color-primitives.md"), true);
  // Slice 6 — content/global empty-cell fix (— for no-entry).
  assert.equal(
    isWysiwygSafePath("content/src/writing/capitalization.md"),
    true,
  );
  assert.equal(isWysiwygSafePath("content/src/writing/punctuation.md"), true);
  // Slice 7 — backtick-wrapped literals (URL/email/filename/placeholder) → no escape/autolink drift.
  assert.equal(isWysiwygSafePath("components/src/link/content.md"), true);
  assert.equal(isWysiwygSafePath("components/src/table/content.md"), true);
  assert.equal(isWysiwygSafePath("components/src/text-input/content.md"), true);
});

test("isWysiwygSafePath — false for files NOT in the registry", () => {
  // AUTHORING.md stays out — non-idempotent round-trip (rt2 !== rt1: loose-list + cell normalization).
  assert.equal(isWysiwygSafePath("foundations/src/AUTHORING.md"), false);
  assert.equal(
    isWysiwygSafePath("content/src/writing/words-to-avoid.md"),
    false,
  );
  assert.equal(isWysiwygSafePath("content/src/AUTHORING.md"), false);
});

test("shouldUseWysiwyg includes registry-safe content/a11y files when flagged", () => {
  setWysiwygFlag("source");
  assert.equal(shouldUseWysiwyg("accessibility/src/color-contrast.md"), false);
  setWysiwygFlag("rich");
  assert.equal(shouldUseWysiwyg("accessibility/src/color-contrast.md"), true);
  assert.equal(shouldUseWysiwyg("content/src/global-guidelines.md"), true);
  // Slice 6 — content/global stragglers now registry-safe.
  assert.equal(shouldUseWysiwyg("content/src/writing/capitalization.md"), true);
  assert.equal(shouldUseWysiwyg("content/src/writing/punctuation.md"), true);
  assert.equal(
    shouldUseWysiwyg("content/src/writing/words-to-avoid.md"),
    false,
  );
  // Slice 4 recovered aria-labels (inline-code/<Media>-aware fail-closed).
  assert.equal(shouldUseWysiwyg("accessibility/src/aria-labels.md"), true);
  setWysiwygFlag("source");
});
