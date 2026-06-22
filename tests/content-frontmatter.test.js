"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createValidator } = require("../scripts/validate/lib-validator");
const { validateContentSrc } = require("../scripts/validate/validate-content");

test("all live content/src frontmatter validates against schemas/content.json", () => {
  // [] also proves README.md/AUTHORING.md are excluded (else README → a
  // 'missing frontmatter' record).
  assert.deepEqual(validateContentSrc(), []);
});

test("schema requires title", () => {
  const validate = createValidator("content.json");
  assert.equal(validate({ nav_order: 1 }), false);
});

test("schema rejects unknown fields (additionalProperties:false)", () => {
  const validate = createValidator("content.json");
  assert.equal(validate({ title: "X", bogus: true }), false);
});

test("schema accepts a full valid record", () => {
  const validate = createValidator("content.json");
  const ok = validate({
    title: "Forms",
    nav_order: 14,
    relatedComponents: ["input", "checkbox-with-label"],
    nav_exclude: true,
    search_exclude: true,
  });
  assert.ok(ok, JSON.stringify(validate.errors));
});

test("schema accepts a words-to-avoid frontmatter record", () => {
  const validate = createValidator("content.json");
  const ok = validate({
    title: "Words to avoid",
    nav_order: 5,
    wordsToAvoid: [
      {
        avoid: ["please", "sorry"],
        reason: 'Never say "Please" or "Sorry" — they are unnecessary.',
        example: { do: "Contact Support", dont: "Please Contact Support" },
      },
      {
        avoid: [],
        reason: "Never use developer-speak.",
        example: { do: "Click the **OK** button.", dont: "Click the OK CTA." },
      },
    ],
  });
  assert.ok(ok, JSON.stringify(validate.errors));
});

test("schema rejects a words-to-avoid row missing example", () => {
  const validate = createValidator("content.json");
  assert.equal(
    validate({ title: "X", wordsToAvoid: [{ avoid: [], reason: "y" }] }),
    false,
  );
});
