const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const lib = require("../scripts/components/token-bindings-lib");

const TEXT = fs.readFileSync(
  __dirname + "/fixtures/card-for-perimeter.design-context.txt",
  "utf8",
);

test("parseDesignContext extracts own-node property->varName, skipping instance internals", () => {
  const parsed = lib.parseDesignContext(TEXT);
  // root own node
  assert.deepEqual(parsed["14783:7564"], {
    "background-color": "color-bg-default",
    padding: "spacing/spacing-sm",
    "border-radius": "border-radius-sm",
  });
  // instance-internal node (I…;…) must be absent
  assert.equal(parsed["I14783:7552;14007:23213"], undefined);
});

test("buildTokenNameSet + normalizeBinding grade against tokens.json", () => {
  const tokens = require("../tokens/tokens.json");
  const set = lib.buildTokenNameSet(tokens);
  assert.equal(set.has("color-bg-default"), true);
  assert.equal(set.has("spacing-sm"), true);
  // clean name
  assert.deepEqual(lib.normalizeBinding("color-bg-default", set), {
    token: "--zen-color-bg-default",
    grade: "semantic",
  });
  // collection-prefixed name: drop first segment matches
  assert.deepEqual(lib.normalizeBinding("spacing/spacing-sm", set), {
    token: "--zen-spacing-sm",
    grade: "semantic",
  });
  // primitive leak
  assert.deepEqual(lib.normalizeBinding("blue/50", set), {
    token: "--zen-blue-50",
    grade: "primitive",
  });
});

test("buildSidecar shapes byNodeId with graded bindings", () => {
  const set = lib.buildTokenNameSet(require("../tokens/tokens.json"));
  const parsed = {
    "14783:7564": {
      "background-color": "color-bg-default",
      padding: "spacing/spacing-sm",
    },
  };
  const doc = lib.buildSidecar(
    "card-for-perimeter",
    parsed,
    set,
    "2026-07-01T00:00:00Z",
  );
  assert.equal(doc.slug, "card-for-perimeter");
  assert.equal(doc._meta.auto_generated, true);
  assert.deepEqual(doc.byNodeId["14783:7564"], [
    {
      property: "background-color",
      token: "--zen-color-bg-default",
      grade: "semantic",
    },
    { property: "padding", token: "--zen-spacing-sm", grade: "semantic" },
  ]);
});

test("bindingGradeStats + renderCoverage tally per slug", () => {
  const stats = lib.bindingGradeStats({
    "card-for-perimeter": {
      byNodeId: { a: [{ grade: "semantic" }, { grade: "primitive" }] },
    },
  });
  assert.deepEqual(stats["card-for-perimeter"], {
    semantic: 1,
    primitive: 1,
    total: 2,
  });
  assert.match(lib.renderCoverage(stats), /card-for-perimeter/);
});
