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
