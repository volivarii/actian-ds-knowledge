"use strict";

// The FM tier's twin of css-owners.test.js, sized honestly.
//
// #554: fmButton emitted fm-button--secondary and fm-button--destructive with
// no rule behind either, so a destructive action rendered as invisible text at
// 1.03:1, and no gate could see it because the css-owner rule covered the DS
// tier only. Measured before writing this: dozens of emitted modifier classes
// have no rule and dozens of axis-value groups render alike once the unstyled
// classes are stripped, so a hard gate over the tier would have been red on
// the day it landed. The tier-wide figures join the dated quality roll-up
// (derive-quality-trend.js) through the SAME classifier and ledger shape the
// DS tier uses; this file keeps the join honest and pins the defect fixed.

var test = require("node:test");
var assert = require("node:assert/strict");
var fm = require("../../scripts/render/lib/fm-collapse.js");
var collapse = require("../../scripts/render/lib/variant-collapse.js");
var FM_BY_DESIGN = require("../../scripts/render/lib/fm-collapse-by-design.js");

test("subject presence: the census drives the renderer with the registry's own values", function () {
  var c = fm.census();
  var button = c.contract.slugs["fm-button"];
  assert.ok(button && button.variants.Type, "the registry's fm-button Type axis was walked");
  assert.ok(button.variants.Type.values.length >= 4, "with its four values");
  assert.ok(c.emitted.has("fm-button--secondary") && c.emitted.has("fm-button--destructive"), "and the two classes #554 named were emitted for them");
  assert.ok(c.owned.has("fm-button--primary"), "fm-base.css owns the positive control");
});

test("an owned rule counts only when it carries a declaration, and never from a comment", function () {
  var owned = fm.ownedModifiers(
    "/* .fm-x--ghost has no rule yet */\n.fm-x--empty {}\n.fm-x--real { color: red; }\n.fm-x--space {   }\n.fm-x--plus\\+one { color: blue }\n.fm-x__dot--on { fill: red }",
  );
  assert.deepEqual([...owned.keys()].sort(), ["fm-x--plus+one", "fm-x--real", "fm-x__dot--on"]);
});

test("two owned classes with identical declarations are the same rendering", function () {
  var owned = fm.ownedModifiers(".fm-x--a { color: red; }\n.fm-x--b { color: red }\n.fm-x--c { color: blue }");
  assert.equal(owned.get("fm-x--a"), owned.get("fm-x--b"), "a byte-copied body is not a different look");
  assert.notEqual(owned.get("fm-x--a"), owned.get("fm-x--c"));
});

test("modifier classes with + and __ are counted, not exempted by a charset", function () {
  var renderer = {
    renderFMComponent: function (n) {
      var v = (n.variant.split("=")[1] || "Label+1line").toLowerCase();
      return '<div class="fm-x fm-x--' + v + '"><i class="fm-x__dot--' + v + '"></i></div>';
    },
  };
  var c = fm.census({
    cssText: "",
    registry: { components: { "fm-x": { variants: { Type: ["Label+1line", "Label+3lines"] } } } },
    renderer: renderer,
  });
  assert.deepEqual(c.unownedModifiers.map(function (u) { return u.class; }).sort(),
    ["fm-x--label+1line", "fm-x--label+3lines", "fm-x__dot--label+1line", "fm-x__dot--label+3lines"]);
  var out = collapse.classify(c.contract, {});
  assert.deepEqual(out.unexplained, ["fm-x Type=Label+3lines"], "unstyled values read alike, whatever their spelling");
});

test("a registry component with no renderer case is reported as unrendered, not as a collapse", function () {
  var renderer = {
    renderFMComponent: function (n) {
      return '<span class="fm-component" data-ref="' + n.ref + '">' + n.ref + "</span>";
    },
  };
  var c = fm.census({ cssText: "", registry: { components: { "fm-cursor": { variants: { "Cursor Type": ["Link", "Pointer"] } } } }, renderer: renderer });
  assert.deepEqual(c.unrendered, ["fm-cursor"]);
  assert.deepEqual(Object.keys(c.contract.slugs), [], "nothing to classify");
});

test("the census uses the DS tier's classifier: state axes are excluded and the ledger applies", function () {
  var renderer = { renderFMComponent: function () { return '<div class="fm-y"></div>'; } };
  var c = fm.census({ cssText: "", registry: { components: { "fm-y": { variants: { State: ["On", "Off"], Style: ["A", "B"] } } } }, renderer: renderer });
  var out = collapse.classify(c.contract, {});
  assert.deepEqual(out.unexplained, ["fm-y Style=B"], "State collapses are the medium's limit, Style collapses are a finding");
  var explained = collapse.classify(c.contract, { "fm-y Style=B": "drawn alike on purpose" });
  assert.deepEqual(explained.unexplained, [], "a ledger entry explains it");
});

test("owned rules the renderer never emits are reported, so a dead rule cannot hide", function () {
  var c = fm.census();
  assert.ok(Array.isArray(c.ownedNotEmitted));
  assert.ok(!c.ownedNotEmitted.includes("fm-button--disabled"), "fmButton draws its Disabled state (it ignored the State axis while a rule waited)");
});

// The defect #554 named, as a regression test: every Type of fm-button must
// still tell itself apart from every other Type once the classes nothing
// styles are removed, and each Type must emit a class the stylesheet owns.
test("#554: fm-button's Type values render pairwise differently and each owns its rule", function () {
  var c = fm.census();
  var out = collapse.classify(c.contract, FM_BY_DESIGN);
  assert.deepEqual(out.unexplained.filter(function (k) { return /^fm-button Type=/.test(k); }), [], "fm-button Type values that render alike");
  var type = c.contract.slugs["fm-button"].variants.Type;
  type.values.forEach(function (value) {
    var own = (c.classesByValue["fm-button Type=" + value] || []).filter(function (cls) { return c.owned.has(cls); });
    assert.ok(own.length > 0, "Type=" + value + " emits a class fm-base.css owns");
  });
});
