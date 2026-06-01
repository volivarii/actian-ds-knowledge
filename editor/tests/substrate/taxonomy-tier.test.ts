import test from "node:test";
import assert from "node:assert/strict";
import { buildTaxonomyFromAssets } from "../../src/substrate/buildTaxonomyFromAssets";

test("taxonomy exposes tier for a11y slugs", () => {
  const tax = buildTaxonomyFromAssets();
  assert.equal(tax.getTier("accessibility", "buttons"), "component-pattern");
  assert.equal(tax.getTier("accessibility", "color-contrast"), "foundation");
});

test("searchSections results carry tier", () => {
  const tax = buildTaxonomyFromAssets();
  const hits = tax.searchSections("button", { domain: "accessibility" });
  const buttons = hits.find((h) => h.slug === "buttons");
  assert.ok(buttons);
  assert.equal(buttons!.tier, "component-pattern");
});
