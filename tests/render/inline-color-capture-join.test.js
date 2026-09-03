"use strict";
// #551: the render tier's inline colours, joined back to the capture that owns
// them.
//
// The issue proposed binding each of the bare hexes in the shipped fragments to
// "the token whose value it already carries". Measured on v0.34.178 that fix is
// not available: 32 unbound values, 15 distinct, and only 2 of the 15 have a
// --zen-* name in tokens.css at all. Both of those would bind by VALUE
// EQUALITY, not by meaning — #ffdacf equals --zen-color-error-50, and it is the
// background of a lineage node, so binding it would turn lineage red under any
// theme that moves the error colour. The bare hexes are faithful: the renderer
// already emits var(--token, value) everywhere the capture carries a token, and
// the rest are unbound in Figma too.
//
// What is left is the real exposure. Three tables in ds-html-map.js RESTATE, by
// hand, colours and token bindings the anatomy capture owns. They agree today —
// measured, zero drift. The moment Figma recolours a type or binds a fill to a
// variable, the table keeps answering with the old value and every gate stays
// green, because nothing joins the two. These tests are that join, and they run
// through the PUBLIC renderer, so what they check is the style a consumer
// actually receives rather than an internal table.
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var DS = require("../../components/render/renderer/html-renderers/ds-html-map.js");
var ANATOMY = path.join(
  __dirname,
  "..",
  "..",
  "components",
  "dist",
  "anatomy",
);

// Per-variant appearance facts for one axis, keyed by axis value. Read from the
// dist the sync writes — never from a list kept here, which is the failure this
// file exists to catch.
function capturedFacts(slug, axis) {
  var doc = JSON.parse(
    fs.readFileSync(path.join(ANATOMY, slug + ".json"), "utf8"),
  );
  var byValue = {};
  (function walk(node) {
    ((node.appearance || {}).variants || []).forEach(function (v) {
      if (v.prop !== axis) return;
      (v.values || []).forEach(function (value) {
        var slot = (byValue[value] = byValue[value] || {});
        ["background", "backgroundToken", "border", "text"].forEach(
          function (k) {
            if (v[k] !== undefined && v[k] !== null) slot[k] = v[k];
          },
        );
      });
    });
    (node.children || []).forEach(walk);
  })(doc.root || doc);
  return byValue;
}

// The tier's own doctrine: the value alone guarantees fidelity, the name beside
// it enables theming, so a captured token is emitted as var(name, value).
function expected(value, token) {
  return token ? "var(" + token + ", " + value + ")" : value;
}

test("digram-item-types renders every captured Item type background as the capture states it", function () {
  var facts = capturedFacts("digram-item-types", "Item type");
  var values = Object.keys(facts).filter(function (v) {
    return facts[v].background;
  });
  // A stale iteration source does not go red, it makes the loop body never run.
  assert.ok(values.length >= 30, "captured backgrounds: " + values.length);
  var bound = 0;
  values.forEach(function (value) {
    var f = facts[value];
    if (f.backgroundToken) bound++;
    var html = DS.renderDSComponent({
      dsSlug: "digram-item-types",
      variant: "Item type=" + value + ", Size=SM",
      props: { Initials: "XX" },
    });
    assert.ok(
      html.indexOf("background:" + expected(f.background, f.backgroundToken)) >=
        0,
      value + " should render background:" + expected(f.background, f.backgroundToken) + " — got " + html,
    );
  });
  // Positive control on the theming half: at least one value is token-bound, so
  // a regression that dropped var() everywhere could not pass this test.
  assert.ok(bound >= 1, "captured token-bound backgrounds: " + bound);
});

test("digram-item-types renders every captured Item type text colour as the capture states it", function () {
  var facts = capturedFacts("digram-item-types", "Item type");
  var values = Object.keys(facts).filter(function (v) {
    return (facts[v].text || {}).color;
  });
  assert.ok(values.length >= 20, "captured text colours: " + values.length);
  var bound = 0;
  values.forEach(function (value) {
    var t = facts[value].text;
    if (t.colorToken) bound++;
    var html = DS.renderDSComponent({
      dsSlug: "digram-item-types",
      variant: "Item type=" + value + ", Size=SM",
      props: { Initials: "XX" },
    });
    assert.ok(
      html.indexOf("color:" + expected(t.color, t.colorToken)) >= 0,
      value + " should render color:" + expected(t.color, t.colorToken) + " — got " + html,
    );
  });
  assert.ok(bound >= 1, "captured token-bound text colours: " + bound);
});

test("digram-topic renders every captured Type background as the capture states it", function () {
  var facts = capturedFacts("digram-topic", "Type");
  var values = Object.keys(facts).filter(function (v) {
    return facts[v].background;
  });
  assert.ok(values.length >= 8, "captured topic backgrounds: " + values.length);
  values.forEach(function (value) {
    var f = facts[value];
    var html = DS.renderDSComponent({
      dsSlug: "digram-topic",
      variant: "Type=" + value,
      props: {},
    });
    assert.ok(
      html.indexOf("background:" + expected(f.background, f.backgroundToken)) >=
        0,
      value + " should render background:" + expected(f.background, f.backgroundToken) + " — got " + html,
    );
  });
});

test("metamodel renders every captured Type border colour as the capture states it", function () {
  var facts = capturedFacts("metamodel", "Type");
  var values = Object.keys(facts).filter(function (v) {
    // Connector values capture border:null — an absence, not a colour; the
    // renderer draws no border rule for them, which METAMODEL_BORDERLESS covers.
    return (facts[v].border || {}).color;
  });
  assert.ok(values.length >= 3, "captured border colours: " + values.length);
  var bound = 0;
  values.forEach(function (value) {
    var b = facts[value].border;
    if (b.colorToken) bound++;
    var html = DS.renderDSComponent({
      dsSlug: "metamodel",
      variant: "Type=" + value,
      props: {},
    });
    assert.ok(
      html.indexOf("border-color:" + expected(b.color, b.colorToken)) >= 0,
      value + " should render border-color:" + expected(b.color, b.colorToken) + " — got " + html,
    );
  });
  assert.ok(bound >= 1, "captured token-bound border colours: " + bound);
});
