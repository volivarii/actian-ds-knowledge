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
  assert.ok(
    probed > 0,
    "no slot was probed at all, so this file asserts nothing",
  );
  assert.ok(
    slugsWithTextProps.length > 0,
    "no slug contributed a text prop, so the probe found no subject",
  );
});

const contract = require("../../components/render/dist/render-contract.json");

// A slot is exempt only with a reason. Exemptions are the escape hatch, not the
// answer: adding one is a decision to ship an empty slot and must read like one.
const EXEMPT = {
  "alert-banner.Title":
    "the Figma component has no title layer, so the alert renders message-only by design",
};

test("no visible text slot renders empty", function () {
  const { empty } = emptyTextSlots();
  const offenders = empty
    .map(function (e) {
      return e.slug + "." + e.prop;
    })
    .filter(function (key) {
      return !Object.prototype.hasOwnProperty.call(EXEMPT, key);
    });
  assert.deepEqual(
    offenders,
    [],
    "these slots render an element with no text, so the fragment ships a component " +
      "missing a part the design file gives it. Supply the value in ds-html-map.js " +
      "from components/dist/anatomy/<slug>.json, or exempt it with a reason: " +
      JSON.stringify(offenders),
  );
});

test("every exemption still names a real slot", function () {
  // The mirror of invariant 10. A slug or prop that disappears must not leave a
  // silent exemption behind that quietly covers a different, real gap later.
  const stale = Object.keys(EXEMPT).filter(function (key) {
    const slug = key.slice(0, key.indexOf("."));
    const prop = key.slice(key.indexOf(".") + 1);
    const entry = contract.slugs[slug];
    if (!entry) return true;
    return !(entry.props || []).some(function (p) {
      return p.name === prop;
    });
  });
  assert.deepEqual(
    stale,
    [],
    "exempted slots the contract no longer has: " + JSON.stringify(stale),
  );
  assert.ok(
    Object.keys(EXEMPT).length > 0,
    "this check compared nothing, so it would pass vacuously",
  );
});
