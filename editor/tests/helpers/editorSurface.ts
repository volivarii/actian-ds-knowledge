import assert from "node:assert/strict";
import { setWysiwygEnabled } from "../../src/lib/editorFlags";

/**
 * Helpers for tests that render a body-editor surface.
 *
 * Both exist to remove a hazard that took the machine down during a full
 * `npm test` run on 2026-07-25:
 *
 * 1. Tests expressed "rich editor off" by CLEARING storage. That encoded the old
 *    opt-IN default. The flag is an opt-OUT now (absent key = on), so a cleared
 *    store reads as ON and every such test silently began asserting the opposite
 *    of its own name. State the surface you want; never lean on the ambient
 *    default, in either direction.
 *
 * 2. Those inverted tests then failed with a DOM element as assert's `actual`.
 *    node:assert renders `actual` with { depth: 1000, sorted: true, getters: true,
 *    customInspect: false }: it walks a cyclic DOM graph, fires every getter and
 *    sorts every key set. It does not terminate. Measured at ~850 MB/s, and with
 *    `node --test` running 10 files in parallel that exhausts a 17 GB machine in
 *    seconds. A DOM node must never reach an assertion as a value.
 */

/** Put the flag in a known state. `"rich"` = WYSIWYG, `"source"` = CodeMirror.
 *  Clears both stores first so a leftover value from an earlier test in the same
 *  file cannot out-vote the choice, then writes through the production setter so
 *  the test exercises the real persistence path rather than a parallel copy. */
export function setWysiwygFlag(surface: "rich" | "source"): void {
  globalThis.localStorage?.clear?.();
  globalThis.sessionStorage?.clear?.();
  setWysiwygEnabled(surface === "rich");
}

/** Assert a query found nothing, WITHOUT handing the node to assert.
 *  The comparison is on a boolean and the failure message names the tag, so a
 *  genuine failure prints one readable line instead of hanging the process. */
export function assertNoElement(el: Element | null | undefined, message: string): void {
  const found = el ? `<${el.tagName?.toLowerCase?.() ?? "?"}>` : "nothing";
  assert.equal(el == null, true, `${message} (found ${found})`);
}

/** Mirror of the above for the present case: asserts a node was found without
 *  making the node itself the compared value. */
export function assertElement(
  el: Element | null | undefined,
  message: string,
): void {
  assert.equal(el != null, true, `${message} (found nothing)`);
}
