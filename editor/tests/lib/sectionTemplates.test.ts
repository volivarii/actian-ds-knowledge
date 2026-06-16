import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTION_TEMPLATES } from "../../src/lib/sectionTemplates";

test("sectionTemplates: content uses the canonical content sections", () => {
  assert.deepEqual(SECTION_TEMPLATES.content, [
    "When to use",
    "Style",
    "Behavior",
    "Do / Don't",
  ]);
});

test("sectionTemplates: usage + behavior have editorial headings", () => {
  assert.ok(SECTION_TEMPLATES.usage.length >= 2);
  assert.ok(SECTION_TEMPLATES.behavior.length >= 2);
});

test("sectionTemplates: has no design key (design comes from the substrate canon)", () => {
  assert.equal("design" in SECTION_TEMPLATES, false);
});
