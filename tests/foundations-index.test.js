"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var astWalk = require("../scripts/foundations/foundations-parser/ast-walk.js");

test("cleanHeading strips a trailing {#anchor} so the slug is unchanged", function () {
  assert.equal(astWalk.slugify(astWalk.cleanHeading("2. Tokens {#tokens}")), "tokens");
  assert.equal(
    astWalk.slugify(astWalk.cleanHeading("3. Design Guidelines {#design-guidelines}")),
    "design-guidelines",
  );
  // No anchor → behaves exactly as before
  assert.equal(astWalk.slugify(astWalk.cleanHeading("1. Color Primitives")), "color-primitives");
});
