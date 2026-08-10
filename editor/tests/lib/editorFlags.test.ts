import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isWysiwygEnabled, setWysiwygEnabled } from "../../src/lib/editorFlags";

// The rich editor is now the DEFAULT, so this flag is an opt-OUT: an absent key
// means on. Per-file safety is a SEPARATE gate — shouldUseWysiwyg intersects this
// flag with the CI-derived rich-safe set — so flipping the default cannot expose
// a file whose round-trip is unproven; those still open in the source pane.
function clearAll() {
  globalThis.sessionStorage.clear();
  globalThis.localStorage.clear();
}

test("rich editor is ON when nothing is stored", () => {
  clearAll();
  assert.equal(isWysiwygEnabled(), true);
});

test("an explicit opt-out in localStorage turns it OFF", () => {
  clearAll();
  globalThis.localStorage.setItem("editor.wysiwyg", "0");
  assert.equal(isWysiwygEnabled(), false);
  clearAll();
});

test("an explicit opt-out in sessionStorage turns it OFF (back-compat)", () => {
  clearAll();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "0");
  assert.equal(isWysiwygEnabled(), false);
  clearAll();
});

test("a stored opt-IN from the alpha keeps it on", () => {
  // Anyone who enabled the alpha already has "1" stored; it must keep reading as
  // on rather than as an unrecognised value.
  clearAll();
  globalThis.localStorage.setItem("editor.wysiwyg", "1");
  assert.equal(isWysiwygEnabled(), true);
  clearAll();
});

test("setWysiwygEnabled(false) RECORDS the opt-out instead of clearing the key", () => {
  // Load-bearing under an opt-out default: removing the key would mean "never
  // chose", which now reads as ON, so turning the editor off would not stick.
  clearAll();
  setWysiwygEnabled(false);
  assert.equal(globalThis.localStorage.getItem("editor.wysiwyg"), "0");
  assert.equal(isWysiwygEnabled(), false);
  clearAll();
});

test("setWysiwygEnabled(false) also clears a stale sessionStorage opt-in", () => {
  clearAll();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  setWysiwygEnabled(false);
  assert.equal(globalThis.sessionStorage.getItem("editor.wysiwyg"), null);
  assert.equal(isWysiwygEnabled(), false);
  clearAll();
});

test("setWysiwygEnabled(true) clears a stale sessionStorage opt-out", () => {
  // sessionStorage is read too, so an old "0" there would out-vote the
  // localStorage opt-in the author just made.
  clearAll();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "0");
  setWysiwygEnabled(true);
  assert.equal(globalThis.sessionStorage.getItem("editor.wysiwyg"), null);
  assert.equal(isWysiwygEnabled(), true);
  clearAll();
});

test("turning it off and back on lands ON", () => {
  clearAll();
  setWysiwygEnabled(false);
  assert.equal(isWysiwygEnabled(), false);
  setWysiwygEnabled(true);
  assert.equal(isWysiwygEnabled(), true);
  clearAll();
});

test("unreadable storage falls back to the default (ON), not to OFF", () => {
  // Private-browsing restrictions must not silently drop every author back to
  // the source pane.
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError: storage is not available");
    },
  });
  try {
    assert.equal(isWysiwygEnabled(), true);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
  }
});
