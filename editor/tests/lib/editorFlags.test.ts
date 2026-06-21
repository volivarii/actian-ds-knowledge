import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isWysiwygEnabled } from "../../src/lib/editorFlags";

test("wysiwyg flag is off by default", () => {
  globalThis.sessionStorage.clear();
  assert.equal(isWysiwygEnabled(), false);
});

test("wysiwyg flag reads sessionStorage", () => {
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  assert.equal(isWysiwygEnabled(), true);
  globalThis.sessionStorage.clear();
});
