import { test } from "node:test";
import assert from "node:assert/strict";
import { baseSlug, deriveUniqueSlug } from "../../src/markdown-engine/anchorSlug";

const OK = /^[a-z][a-z0-9-]*$/;

test("baseSlug: kebab-cases and guarantees a leading letter", () => {
  assert.equal(baseSlug("When to use"), "when-to-use");
  assert.equal(baseSlug("3. Guidelines"), "guidelines"); // leading non-letters dropped
  assert.equal(baseSlug("  Spaced  &  Punctuated!! "), "spaced-punctuated");
  assert.equal(baseSlug("123"), "section"); // nothing letter-led remains
  assert.equal(baseSlug(""), "section");
  assert.ok(OK.test(baseSlug("3. Guidelines")));
});

test("deriveUniqueSlug: returns the base when free", () => {
  assert.equal(deriveUniqueSlug("New Section", []), "new-section");
});

test("deriveUniqueSlug: disambiguates against taken slugs", () => {
  assert.equal(deriveUniqueSlug("Overview", ["overview"]), "overview-2");
  assert.equal(
    deriveUniqueSlug("Overview", new Set(["overview", "overview-2"])),
    "overview-3",
  );
});

test("deriveUniqueSlug: output always matches the anchor slug grammar", () => {
  for (const h of ["3. Guidelines", "!!!", "Do & Don't", "A"]) {
    assert.ok(OK.test(deriveUniqueSlug(h, [])), `bad slug from ${h}`);
  }
});
