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
  assert.deepEqual(SECTION_TEMPLATES.usage, [
    "When to use",
    "When not to use",
    "Choosing a variant",
  ]);
  assert.deepEqual(SECTION_TEMPLATES.behavior, [
    "States",
    "Keyboard interaction",
    "Motion",
  ]);
});

test("sectionTemplates: has no design key (design comes from the substrate canon)", () => {
  assert.equal("design" in SECTION_TEMPLATES, false);
});
