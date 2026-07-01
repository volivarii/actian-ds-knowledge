"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const derive = require(
  path.join(REPO_ROOT, "scripts", "components", "derive-guidelines"),
);

const validators = derive.makeValidators(REPO_ROOT);

test("tokens schema: binding with a valid CSS property passes", () => {
  const ok = validators.tokens({
    bindings: [
      { token: "color-bg-default", property: "background-color", context: "Fill" },
    ],
  });
  assert.equal(ok, true, JSON.stringify(validators.tokens.errors));
});

test("tokens schema: binding without property still passes (optional)", () => {
  const ok = validators.tokens({
    bindings: [{ token: "color-bg-default", context: "Fill" }],
  });
  assert.equal(ok, true, JSON.stringify(validators.tokens.errors));
});

test("tokens schema: unknown property value is rejected", () => {
  const ok = validators.tokens({
    bindings: [
      { token: "color-bg-default", property: "not-a-real-prop", context: "Fill" },
    ],
  });
  assert.equal(ok, false);
});
