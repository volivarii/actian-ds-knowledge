// Data for the inline reference hover-preview card: the target's cleaned title,
// type, its category, and how many components use it — all from the baked
// graph. Honest: only a real component slug resolves; the Figma status emoji is
// stripped from titles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { referenceCardData } from "../../src/lib/referenceCard";

test("resolves a component slug to title + type + category + usage count", () => {
  const d = referenceCardData("button")!;
  assert.ok(d, "button resolves");
  assert.equal(d.title, "Button");
  assert.equal(d.type, "component");
  assert.equal(d.category, "Action");
  assert.ok(d.usedBy > 0, "button is used by other components/patterns");
});

test("strips the Figma status emoji from the title", () => {
  // component:table's graph title carries a status marker (e.g. "✍️ Table").
  const d = referenceCardData("table")!;
  assert.ok(d, "table resolves");
  assert.equal(d.title, "Table", "status emoji stripped");
});

test("returns null for a non-component slug", () => {
  assert.equal(referenceCardData("dropdown-select"), null);
  assert.equal(referenceCardData("nonexistent-xyz"), null);
});
