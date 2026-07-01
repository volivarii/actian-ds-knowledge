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
