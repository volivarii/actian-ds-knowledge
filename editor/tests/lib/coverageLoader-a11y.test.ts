import test from "node:test";
import assert from "node:assert/strict";
import { parseA11yRefs } from "../../src/lib/coverageLoader";

test("parseA11yRefs extracts ref slugs from a11y_refs array", () => {
  assert.deepEqual(
    parseA11yRefs({ a11y_refs: [{ ref: "buttons" }, { ref: "modals", note: "x" }] }),
    ["buttons", "modals"],
  );
});

test("parseA11yRefs returns [] when a11y_refs is absent or malformed", () => {
  assert.deepEqual(parseA11yRefs({}), []);
  assert.deepEqual(parseA11yRefs({ a11y_refs: "nope" }), []);
  assert.deepEqual(parseA11yRefs({ a11y_refs: [{ note: "no ref" }, 5] }), []);
});
