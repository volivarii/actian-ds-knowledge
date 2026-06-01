"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const index = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, "accessibility/dist/a11y-index.json"),
    "utf8",
  ),
);

const VALID_TIERS = new Set([
  "foundation",
  "component-pattern",
  "checklist",
  "header",
]);

test("every a11y-index section carries a valid tier", () => {
  const bad = index.sections.filter((s) => !VALID_TIERS.has(s.tier));
  assert.deepEqual(
    bad.map((s) => s.slug + ":" + s.tier),
    [],
    "sections missing/invalid tier",
  );
});

test("tier assignments match the source heading hierarchy", () => {
  const tierOf = (slug) => index.bySlug[slug].tier;
  assert.equal(tierOf("principles"), "header");
  assert.equal(tierOf("components"), "header");
  assert.equal(tierOf("designer-handoff-checklist"), "header");
  assert.equal(tierOf("color-contrast"), "foundation");
  assert.equal(tierOf("focus-keyboard"), "foundation");
  assert.equal(tierOf("buttons"), "component-pattern");
  assert.equal(tierOf("modals"), "component-pattern");
  assert.equal(tierOf("states"), "checklist");
  assert.equal(tierOf("reading-order-touch"), "checklist");
});
