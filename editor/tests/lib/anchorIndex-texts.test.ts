import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setCachedIndexForTesting,
  getCachedText,
} from "../../src/lib/anchorIndex";

test("getCachedText returns the cached text for a scanned path, null otherwise", () => {
  setCachedIndexForTesting({
    entries: new Map(),
    scannedAt: 0,
    scannedPaths: ["foundations/src/intro.md"],
    texts: new Map([["foundations/src/intro.md", "# Intro\n\nBody."]]),
  });
  assert.equal(getCachedText("foundations/src/intro.md"), "# Intro\n\nBody.");
  assert.equal(getCachedText("nope.md"), null);
  setCachedIndexForTesting(null);
});
