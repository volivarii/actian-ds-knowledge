"use strict";

// The FM tier's twin of css-owners.test.js, sized honestly.
//
// #554: fmButton emitted fm-button--secondary and fm-button--destructive with
// no rule behind either, so a destructive action rendered as invisible text at
// 1.03:1, and no gate could see it because the css-owner rule covered the DS
// tier only. Measured before writing this: 54 of the modifier classes the FM
// renderer emits from registry values have no rule, and 35 axis-value groups
// render identically once unowned classes are stripped. A hard gate over the
// tier would be red on the day it landed, so the tier-wide figure joins the
// dated quality roll-up (derive-quality-trend.js) as a measure with a
// direction, and this file keeps the join honest and pins the defect that was
// fixed.

var test = require("node:test");
var assert = require("node:assert/strict");
var fm = require("../../scripts/render/lib/fm-collapse.js");

test("subject presence: the census drives the renderer with the registry's own values and reads the stylesheet", function () {
  var c = fm.census();
  assert.ok(c.emitted.has("fm-button--primary"), "the join produced fm-button--primary");
  assert.ok(c.owned.has("fm-button--primary"), "fm-base.css owns the positive control");
  assert.ok(c.emitted.size > 20, "the census covers the tier, not one component: " + c.emitted.size);
  assert.ok(c.axes > 20, "the registry's axes were walked: " + c.axes);
});

test("an owned rule counts only when it carries a declaration", function () {
  var owned = fm.ownedModifiers(".fm-x--empty {}\n.fm-x--real { color: red; }\n.fm-x--space {   }");
  assert.deepEqual([...owned].sort(), ["fm-x--real"], "an empty block owns nothing");
});

// The defect #554 named, as a regression test: every Type of fm-button must
// still tell itself apart from every other Type once the classes nothing
// styles are removed. Before the two rules landed, Secondary and Destructive
// were identical to each other and to an unstyled div.
test("#554: fm-button's Type values render pairwise differently once unowned classes are stripped", function () {
  var c = fm.census();
  var group = c.collapsedGroups.filter(function (g) {
    return g.slug === "fm-button" && g.axis === "Type";
  });
  assert.deepEqual(group, [], "fm-button Type values that render alike");
});

test("the census reports the tier-wide figures the roll-up publishes", function () {
  var c = fm.census();
  assert.strictEqual(typeof c.collapsedGroups.length, "number");
  assert.strictEqual(typeof c.unownedModifiers.length, "number");
  c.collapsedGroups.forEach(function (g) {
    assert.ok(g.slug && g.axis && g.values.length > 1, "a group names its slug, axis and 2+ values");
  });
});
