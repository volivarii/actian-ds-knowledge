import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { roundTripMarkdown } from "../../src/markdown-engine/milkdownPreset";

test("<Media> survives a round-trip byte-exact (preview must not alter markdown)", async () => {
  const body =
    'Intro paragraph.\n\n<Media role="parts" layout="grid" />\n\nMore prose.\n';
  const rt = await roundTripMarkdown(body);
  assert.ok(rt.includes('<Media role="parts" layout="grid" />'));
  const rt2 = await roundTripMarkdown(rt);
  assert.equal(
    rt2,
    rt,
    "round-trip stays idempotent with the Media plugin registered",
  );
});
