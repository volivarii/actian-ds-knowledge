import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isWysiwygEnabled, setWysiwygEnabled } from "../../src/lib/editorFlags";

// Clear both stores before each test by clearing at test start.
function clearAll() {
  globalThis.sessionStorage.clear();
  globalThis.localStorage.clear();
}

test("wysiwyg flag is off by default", () => {
  clearAll();
  assert.equal(isWysiwygEnabled(), false);
});

test("wysiwyg flag reads sessionStorage (back-compat)", () => {
  clearAll();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  assert.equal(isWysiwygEnabled(), true);
  clearAll();
});

test("wysiwyg flag reads localStorage", () => {
  clearAll();
  globalThis.localStorage.setItem("editor.wysiwyg", "1");
  assert.equal(isWysiwygEnabled(), true);
  clearAll();
});

test("wysiwyg flag is true when only localStorage set", () => {
  clearAll();
  globalThis.localStorage.setItem("editor.wysiwyg", "1");
  assert.equal(isWysiwygEnabled(), true);
  clearAll();
});

test("wysiwyg flag is false when neither storage has key", () => {
  clearAll();
  assert.equal(isWysiwygEnabled(), false);
});

test("setWysiwygEnabled(true) sets localStorage key", () => {
  clearAll();
  setWysiwygEnabled(true);
  assert.equal(globalThis.localStorage.getItem("editor.wysiwyg"), "1");
  clearAll();
});

test("setWysiwygEnabled(false) removes localStorage key", () => {
  clearAll();
  globalThis.localStorage.setItem("editor.wysiwyg", "1");
  setWysiwygEnabled(false);
  assert.equal(globalThis.localStorage.getItem("editor.wysiwyg"), null);
  clearAll();
});

test("setWysiwygEnabled(false) also removes sessionStorage key (clears stale session value)", () => {
  clearAll();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  setWysiwygEnabled(false);
  assert.equal(globalThis.sessionStorage.getItem("editor.wysiwyg"), null);
  assert.equal(isWysiwygEnabled(), false);
  clearAll();
});
