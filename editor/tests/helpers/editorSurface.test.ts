import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isWysiwygEnabled } from "../../src/lib/editorFlags";
import {
  setWysiwygFlag,
  assertNoElement,
  assertElement,
} from "./editorSurface";

// These two guards are the machine-crash postmortem of 2026-07-25 written down
// as assertions. Both failures below were silent before: the suite went from
// "green" to "the OS runs out of memory" with nothing in between.

test("setWysiwygFlag states the surface instead of relying on the default", () => {
  // The original bug: "off" was expressed by CLEARING storage, which silently
  // encoded whatever the default happened to be at the time. When the default
  // moved, every such test inverted without a word.
  //
  // So this asserts only that each surface is REACHED explicitly. What the
  // ambient default is belongs to tests/lib/editorFlags.test.ts, which owns that
  // decision; duplicating it here would re-create the same coupling in the very
  // helper meant to break it.
  setWysiwygFlag("source");
  assert.equal(
    isWysiwygEnabled(),
    false,
    "source surface must actually be off",
  );

  setWysiwygFlag("rich");
  assert.equal(isWysiwygEnabled(), true, "rich surface must actually be on");

  // Must survive a round trip in either order, since files reuse one store.
  setWysiwygFlag("source");
  assert.equal(isWysiwygEnabled(), false, "re-selecting source must stick");
});

test("assertNoElement never hands the DOM node to node:assert", () => {
  // node:assert inspects `actual` with depth 1000, sorted keys and getters ON.
  // On a DOM node that walk does not terminate (~850 MB/s until the OS gives
  // out). The contract is that a failure produces one short, readable line, so
  // asserting on message SIZE is what proves the node was never serialized.
  const el = globalThis.document.createElement("div");
  el.setAttribute("role", "textbox");
  globalThis.document.body.appendChild(el);

  let message: string | null = null;
  try {
    assertNoElement(el, "must use CodeMirror");
    assert.fail("assertNoElement should have thrown for a present element");
  } catch (e) {
    message = (e as Error).message;
  }
  globalThis.document.body.removeChild(el);

  assert.equal(typeof message, "string");
  assert.ok(
    (message as string).length < 200,
    `failure message must stay short; a serialized DOM node is the crash. Got ${(message as string).length} chars`,
  );
  assert.match(message as string, /must use CodeMirror/);
  assert.match(message as string, /<div>/, "message should name the tag found");
});

test("assertNoElement passes for null, assertElement is its mirror", () => {
  assertNoElement(null, "nothing rendered");
  assertNoElement(undefined, "nothing rendered");

  const el = globalThis.document.createElement("p");
  assertElement(el, "element expected");

  let threw = false;
  try {
    assertElement(null, "element expected");
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "assertElement must fail when nothing was found");
});
