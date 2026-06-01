import test from "node:test";
import assert from "node:assert/strict";
import {
  computeTopicCoverage,
  thinComponents,
  type TopicState,
} from "../../src/lib/a11yCoverage";
import type { CoverageRow } from "../../src/lib/coverageLoader";
import type { Taxonomy } from "../../src/substrate/taxonomy";

const fakeTaxonomy: Taxonomy = {
  getSlugs: () => [
    "buttons",
    "modals",
    "tabs",
    "drag-drop",
    "forms",
    "color-contrast",
  ],
  getTitle: (_d, s) =>
    ({
      buttons: "Buttons",
      modals: "Modals",
      tabs: "Tabs",
      "drag-drop": "Drag & Drop",
      forms: "Forms",
      "color-contrast": "Color contrast",
    })[s] ?? null,
  getBody: () => null,
  getTier: (_d, s) =>
    s === "color-contrast" ? "foundation" : "component-pattern",
  domainOfSlug: () => "accessibility",
  searchSections: () => [],
};

function row(
  slug: string,
  a11yRefs: string[],
  origin: CoverageRow["origin"] = "authored",
): CoverageRow {
  return { slug, component: slug, domains: {} as never, origin, a11yRefs };
}

test("computeTopicCoverage classifies the four states (foundation excluded)", () => {
  const rows = [
    row("button", ["buttons"]),
    row("sticky-footer", ["buttons"]),
    row("modal", ["modals"]),
  ];
  const categoryRefs = {
    forms: ["form-input-selection"],
    tabs: ["navigation"],
  };
  const cov = computeTopicCoverage(rows, categoryRefs, fakeTaxonomy);
  const bySlug = Object.fromEntries(cov.map((c) => [c.slug, c]));
  assert.equal(bySlug.buttons!.state, "well-hosted");
  assert.equal(bySlug.modals!.state, "single-host");
  assert.equal(bySlug.tabs!.state, "category-only");
  assert.deepEqual(bySlug.tabs!.categoryHosts, ["navigation"]);
  assert.equal(bySlug["drag-drop"]!.state, "orphan");
  assert.equal(bySlug.forms!.state, "category-only");
  assert.ok(!("color-contrast" in bySlug), "foundation tier excluded");
  assert.deepEqual(bySlug.buttons!.componentHosts.map((h) => h.slug).sort(), [
    "button",
    "sticky-footer",
  ]);
});

test("computeTopicCoverage sorts gaps first", () => {
  const cov = computeTopicCoverage(
    [row("button", ["buttons"]), row("x", ["buttons"])],
    {},
    fakeTaxonomy,
  );
  const states = cov.map((c) => c.state);
  const order: Record<TopicState, number> = {
    orphan: 0,
    "category-only": 1,
    "single-host": 2,
    "well-hosted": 3,
  };
  for (let i = 1; i < states.length; i++) {
    assert.ok(
      order[states[i - 1]!] <= order[states[i]!],
      "states must be gaps-first",
    );
  }
});

test("thinComponents lists authored rows with no a11y refs", () => {
  const rows = [
    row("button", ["buttons"]),
    row("link", []),
    row("ghost", [], "unstarted"),
  ];
  assert.deepEqual(thinComponents(rows), [{ slug: "link", component: "link" }]);
});
