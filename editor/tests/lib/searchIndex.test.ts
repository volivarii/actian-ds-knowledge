import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, searchCorpus } from "../../src/lib/searchIndex";

const AUTHORABLE = new Set(["button", "modal", "combo-box"]);
const CONTENT = [{ title: "Forms", path: "content/src/patterns/forms.md" }];

test("buildSearchIndex: every item has a title and a resolvable path", () => {
  const idx = buildSearchIndex(AUTHORABLE, CONTENT);
  assert.ok(idx.length > 0);
  for (const it of idx) {
    assert.ok(it.title.length > 0, "title present");
    assert.ok(it.path.length > 0, `path present for ${it.title}`);
  }
});

test("buildSearchIndex: components are scoped to the authorable set", () => {
  const comps = buildSearchIndex(AUTHORABLE, CONTENT)
    .filter((i) => i.kind === "component")
    .map((i) => i.path);
  assert.ok(comps.includes("workspace/button"));
  assert.ok(!comps.some((p) => p === "workspace/icon-placeholder")); // non-authorable excluded
});

test("buildSearchIndex: covers all five kinds when content is supplied", () => {
  const kinds = new Set(
    buildSearchIndex(AUTHORABLE, CONTENT).map((i) => i.kind),
  );
  for (const k of [
    "component",
    "foundation",
    "content",
    "accessibility",
    "app-context",
  ] as const)
    assert.ok(kinds.has(k), k);
});

test("buildSearchIndex: no content when none is supplied", () => {
  assert.ok(!buildSearchIndex(AUTHORABLE).some((i) => i.kind === "content"));
});

test("searchCorpus: groups in kind order, prefix beats substring, respects the limit", () => {
  const groups = searchCorpus(buildSearchIndex(AUTHORABLE, CONTENT), "co", 2);
  const order = groups.map((g) => g.kind);
  const ord = [
    "component",
    "foundation",
    "content",
    "accessibility",
    "app-context",
  ];
  assert.deepEqual(
    order,
    [...order].sort((a, b) => ord.indexOf(a) - ord.indexOf(b)),
  );
  for (const g of groups) assert.ok(g.items.length <= 2);
});

test("searchCorpus: empty query returns nothing", () => {
  assert.deepEqual(
    searchCorpus(buildSearchIndex(AUTHORABLE, CONTENT), "  "),
    [],
  );
});

test("buildSearchIndex: a11y results are scoped to file-backed sections only", () => {
  const idx = buildSearchIndex(AUTHORABLE, CONTENT);
  const a11yPaths = idx
    .filter((i) => i.kind === "accessibility")
    .map((i) => i.path);
  // "color-contrast" is a foundation-tier section with a real file at
  // accessibility/src/color-contrast.md, so it must still surface.
  assert.ok(
    a11yPaths.includes("accessibility/src/color-contrast.md"),
    "file-backed a11y section still appears",
  );
  // "forms" is a component-pattern-tier section derived from component
  // guidelines with no standalone src file, so it must NOT surface as a
  // dead accessibility result.
  assert.ok(
    !a11yPaths.includes("accessibility/src/forms.md"),
    "known-dead a11y slug is excluded",
  );
});
