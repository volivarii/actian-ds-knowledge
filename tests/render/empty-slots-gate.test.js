"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { emptyTextSlots } = require("./helpers/empty-slots.js");

// Controls first. A probe that cannot tell a filled slot from an empty one
// would report an empty list and read as an all-clear, so both directions are
// asserted against slots whose state is fixed by design and will not drift:
//   alert-banner.Title  - the Figma component has no title layer, so it stays empty
//   empty-state.Body    - carries a long literal fallback in the renderer
test("the probe detects a slot that renders empty", function () {
  const { empty } = emptyTextSlots();
  const hit = empty.find(function (e) {
    return e.slug === "alert-banner" && e.prop === "Title";
  });
  assert.ok(hit, "alert-banner.Title renders empty and the probe must say so");
});

test("the probe does not flag a slot that carries content", function () {
  const { empty } = emptyTextSlots();
  const miss = empty.find(function (e) {
    return e.slug === "empty-state" && e.prop === "Body";
  });
  assert.equal(miss, undefined, "empty-state.Body has a literal fallback");
});

test("the probe is not vacuous", function () {
  const { probed, slugsWithTextProps } = emptyTextSlots();
  assert.ok(probed > 0, "no slot was probed at all, so this file asserts nothing");
  assert.ok(
    slugsWithTextProps.length > 0,
    "no slug contributed a text prop, so the probe found no subject",
  );
});
