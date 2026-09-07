"use strict";

// THE STRUCTURAL-COLLAPSE RATCHET, and the join it rests on.
//
// The property: where the capture records that a variant value has a different
// SHAPE from its base (a different child list, or a different node kind), the
// renderer must not draw it identically to a sibling. That set may shrink. It
// may not grow, and no member may be swapped for another.
//
// A ratchet rather than a flat assertion, because 20 members are currently
// unrendered and a gate demanding all of them at once would block every
// unrelated change. That is the same call the FM figures made when their tier
// was sized in dozens: measure, with a floor that cannot rise.
//
// Compared as a SET, not a count. A count passes when one value is fixed and
// another breaks, which is the regression least likely to be caught by eye and
// exactly what a burndown number would report as progress.

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var S = require(path.join(REPO_ROOT, "scripts/render/lib/structural-evidence.js"));
var C = require(path.join(REPO_ROOT, "scripts/render/lib/variant-collapse.js"));
var BY_DESIGN = require(
  path.join(REPO_ROOT, "scripts/render/lib/variant-collapse-by-design.js"),
);
var trend = require(path.join(REPO_ROOT, "scripts/render/derive-quality-trend.js"));
var deriveContract = require(
  path.join(REPO_ROOT, "scripts/render/derive-contract.js"),
).deriveContract;

var TREND_REL = "components/render/dist/quality-trend.json";

test("the capture holds structural facts, so this gate has a subject", function () {
  // Subject presence. `quality.structuralVariants` is written by the sync; if a
  // capture change dropped it, every assertion below would compare two empty
  // sets and this file would report success over nothing.
  var facts = S.structuralKeys();
  assert.ok(
    facts.size > 0,
    "no anatomy capture carries quality.structuralVariants; either the sync " +
      "stopped emitting it or the read in structural-evidence.js is stale",
  );
});

test("the join survives a prop whose spelling differs between capture and contract", function () {
  // `Size & Type` is written with spaces and an ampersand in both places, and
  // `Built type` differs in case. An exact-string join returned nothing for
  // those and reported a clean zero, which is the failure mode a normalised
  // join exists to prevent. Asserted on a real member rather than a fixture.
  var hits = S.unrenderedStructural(deriveContract(), BY_DESIGN);
  var keys = hits.map(function (h) {
    return h.key;
  });
  assert.ok(
    keys.some(function (k) {
      return k.indexOf("Size & Type") !== -1;
    }),
    "no `Size & Type` member matched, so the join is exact-string again: " +
      JSON.stringify(keys),
  );
});

test("every hit quotes the capture's own evidence, so a reader can check it", function () {
  var hits = S.unrenderedStructural(deriveContract(), BY_DESIGN);
  assert.ok(hits.length > 0, "nothing to check");
  hits.forEach(function (h) {
    assert.ok(h.evidence, h.key + " carries no evidence object");
    assert.ok(
      typeof h.evidence.reason === "string" && h.evidence.reason.length > 0,
      h.key + " carries no reason, so the finding cannot be verified by hand",
    );
  });
});

test("the State axis is excluded here, as it is everywhere else in this tier", function () {
  // button's capture records State=Loading as [instance:Spinner] against a
  // three-child base, which is structurally different and NOT a different
  // component. One rule across the tier, or the census and this gate disagree
  // about what a variant is.
  var keys = Array.from(S.structuralKeys().keys());
  assert.ok(keys.length > 0);
  keys.forEach(function (k) {
    var axis = k.slice(k.indexOf(" ") + 1).split("=")[0];
    assert.ok(
      !C.isStateAxis(axis),
      "a State-axis fact leaked into the structural set: " + k,
    );
  });
});

test("the published measure is this module's own count, not a second derivation", function () {
  // The roll-up must call the same function, or the artifact and the gate can
  // report different numbers for one property. Same join the collapse figure
  // already asserts against its classifier.
  var mine = S.unrenderedStructural(deriveContract(), BY_DESIGN).length;
  var published = trend.currentMeasures().structuralCollapses.value;
  assert.strictEqual(
    published,
    mine,
    "the roll-up reports " + published + " where this module counts " + mine,
  );
});

test("the ratchet's comparison catches a growth AND a swap", function () {
  // Exercised on fixtures because the live check below is vacuous on the commit
  // that introduces the baseline, and a gate whose only path is vacuous on the
  // day it lands is a gate nobody has watched work.
  var base = ["a Type=X", "b Type=Y"];

  assert.deepEqual(S.newlyBroken(base, ["a Type=X"]), [], "a shrink must pass");
  assert.deepEqual(S.newlyBroken(base, base), [], "no change must pass");
  assert.deepEqual(
    S.newlyBroken(base, base.concat(["c Type=Z"])),
    ["c Type=Z"],
    "a growth must be caught",
  );
  // The swap: one fixed, one broken, count identical. A count-based ratchet
  // passes this, which is why the comparison is a set.
  assert.deepEqual(
    S.newlyBroken(base, ["a Type=X", "c Type=Z"]),
    ["c Type=Z"],
    "a swap keeping the count identical must still be caught",
  );
  assert.deepEqual(S.newlyFixed(base, ["a Type=X", "c Type=Z"]), ["b Type=Y"]);
});

test("RATCHET: the structurally-proven set may shrink, never grow or swap", function () {
  // The baseline is the artifact at the MERGE BASE, the same read every other
  // measure uses. Not HEAD: on a branch whose own derive has already run, HEAD
  // holds this run's output and the ratchet would compare a number against
  // itself and pass unconditionally.
  var base = trend.showJson(trend.baselineRef(), TREND_REL);
  var before =
    base && base.detail && Array.isArray(base.detail.structuralCollapseKeys)
      ? base.detail.structuralCollapseKeys
      : null;
  var now = trend.currentMeasures().structuralCollapses.keys;

  if (before === null) {
    // The one honest reason to have nothing to compare: the merge base predates
    // this field. Say so out loud rather than passing quietly, and assert that
    // the artifact IS carrying the keys now, so the next run has a baseline.
    // Without that, a derive that silently stopped publishing them would leave
    // this branch taken forever and the ratchet permanently asleep.
    console.log(
      "      [structural ratchet] no baseline at the merge base; this commit " +
        "publishes " + now.length + " keys as the first one",
    );
    assert.ok(
      now.length > 0,
      "no baseline AND no keys published: the ratchet would never acquire one",
    );
    return;
  }

  assert.ok(
    before.length > 0,
    "the baseline lists no structural collapses at all, which would let any " +
      "regression through; a baseline of zero is not a baseline",
  );

  assert.deepEqual(
    S.newlyBroken(before, now),
    [],
    "these values are proven structurally distinct by the capture and now " +
      "render identically to a sibling, which they did not at the merge base",
  );

  var fixed = S.newlyFixed(before, now);
  if (fixed.length) {
    console.log(
      "      [structural ratchet] " + fixed.length + " now render apart: " +
        fixed.join(", "),
    );
  }
});

test("button Emphasis=Icon-only renders its captured structure, not a labelled pill", function () {
  // The member this work fixed, pinned by its OUTCOME rather than by its
  // absence from a list. The capture records the base as
  // [instance:Leading icon, text:Button, instance:Trailing icon] and this value
  // as [instance:Icon]; the renderer returned markup byte-identical to Filled,
  // so a caller asking for an icon-only button was handed a labelled pill and
  // button is named by 15 UX patterns.
  var dsMap = require(
    path.join(REPO_ROOT, "components/render/renderer/html-renderers/ds-html-map.js"),
  );
  dsMap.setIcons(
    require(path.join(REPO_ROOT, "components/dist/icons/icons.json")).icons || {},
  );
  function render(variant) {
    return dsMap.renderDSComponent({
      dsSlug: "button",
      variant: variant,
      props: { Label: "Save" },
    });
  }
  var filled = render("Intent=Default, Emphasis=Filled");
  var iconOnly = render("Intent=Default, Emphasis=Icon-only");

  assert.notStrictEqual(
    iconOnly,
    filled,
    "Icon-only renders byte-identical to Filled again",
  );
  // Each half of "renders its captured structure", because notStrictEqual alone
  // passes on any difference at all, a stray class included.
  assert.ok(
    /<svg/.test(iconOnly),
    "Icon-only draws no icon, which is a blank round box rather than a button",
  );
  assert.ok(
    !/>\s*Save\s*</.test(iconOnly),
    "Icon-only still renders the label as visible text",
  );
  assert.ok(
    /aria-label="Save"/.test(iconOnly),
    "Icon-only drops the label without giving the control an accessible name",
  );
});
