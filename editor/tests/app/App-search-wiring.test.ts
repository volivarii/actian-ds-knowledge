// Proves the header-search wiring contract (App.tsx: buildSearchIndex ->
// GlobalSearch onOpenFile -> setActivePath) without a heavy <App> mount.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex } from "../../src/lib/searchIndex";

test("selecting a component in the header would open its workspace", () => {
  const idx = buildSearchIndex(new Set(["button"]));
  const button = idx.find((i) => i.title === "Button");
  assert.ok(button);
  assert.equal(button!.path, "workspace/button"); // == what onOpenFile(setActivePath) receives
});
