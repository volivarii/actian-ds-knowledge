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

// ---------------------------------------------------------------------------
// #649: the NESTED item-type badge, joined to the host's own capture.
//
// Three components painted their badge #ffdacf, digram-item-types' documented
// Category fallback, because each read `v["Item type"]` on an axis it does not
// publish, so the fallback fired on every render. Eleven badges: metamodel's
// five, where the border two pixels away was correct per Type, and lineage's
// six. Every declaration was well-formed: #ffdacf is a real captured value and
// Category is a real fallback, so #551's bare-hex census counted them as
// faithful and the variant-collapse census never aliased them, because the
// initials differ per cell.
//
// The check that catches it is a join, and the iteration source is the CAPTURE:
// every component whose anatomy nests a "Digram, Item types" node must render
// that node's captured background. Two of the five subjects were already
// correct before the fix (lineage-grouped-node's captured background IS
// #ffdacf, and card-for-perimeter's is Dataset), which is what shows this
// asserts the capture rather than the absence of peach.
var BADGE_NODE = /^digram, item types$/i;

// Every slug whose capture nests the badge, read from the anatomy dist.
function nestedBadgeSubjects() {
  return fs
    .readdirSync(ANATOMY)
    .filter(function (f) {
      return f.endsWith(".json") && f !== "digram-item-types.json";
    })
    .map(function (f) {
      var doc = JSON.parse(fs.readFileSync(path.join(ANATOMY, f), "utf8"));
      var root = doc.root || doc;
      var found = [];
      (function walk(node) {
        if (!node || typeof node !== "object") return;
        if (BADGE_NODE.test(String(node.name || ""))) found.push(node);
        (node.children || []).forEach(walk);
      })(root);
      return { slug: f.replace(/\.json$/, ""), root: root, nodes: found };
    })
    .filter(function (s) {
      return s.nodes.length > 0;
    });
}

// The style the renderer put on the badge span, for one variant.
function renderedBadgeStyle(slug, variant) {
  var html = DS.renderDSComponent({ dsSlug: slug, variant: variant, props: {} });
  var m = html.match(/class="ds-item-type"[^>]*style="([^"]*)"/);
  return m ? m[1] : null;
}

test("every component nesting an item-type badge renders the captured background", function () {
  var subjects = nestedBadgeSubjects();
  // A stale locator does not go red, it makes the loop body never run.
  assert.ok(
    subjects.length >= 5,
    "components nesting the badge: " + subjects.length,
  );
  var checked = 0;
  subjects.forEach(function (s) {
    var a = s.nodes[0].appearance || {};
    if (!a.background) return;
    // The root node's name IS the default variant combination.
    var style = renderedBadgeStyle(s.slug, String(s.root.name || ""));
    assert.ok(style, s.slug + " renders no ds-item-type badge at all");
    assert.ok(
      style.indexOf("background:" + expected(a.background, a.backgroundToken)) >=
        0,
      s.slug +
        " should render background:" +
        expected(a.background, a.backgroundToken) +
        " on its nested badge, got " +
        style,
    );
    checked++;
  });
  assert.ok(checked >= 5, "subjects with a captured background: " + checked);
});

test("metamodel renders the captured item-type badge background for every Type", function () {
  var subject = nestedBadgeSubjects().find(function (s) {
    return s.slug === "metamodel";
  });
  assert.ok(subject, "metamodel no longer nests an item-type badge");
  var a = subject.nodes[0].appearance || {};
  // The default value, named by the root node ("Type=Dataset"), plus every
  // per-Type override on the badge node itself.
  var byValue = {};
  var defaultType = String(subject.root.name || "").match(/Type=([^,]+)/);
  assert.ok(defaultType, "metamodel's root does not name a default Type");
  byValue[defaultType[1].trim()] = {
    background: a.background,
    backgroundToken: a.backgroundToken,
  };
  (a.variants || []).forEach(function (v) {
    if (v.prop !== "Type" || !v.background) return;
    (v.values || []).forEach(function (value) {
      byValue[value] = {
        background: v.background,
        backgroundToken: v.backgroundToken,
      };
    });
  });
  var types = Object.keys(byValue);
  assert.equal(
    types.length,
    5,
    "captured Types on the badge: " + types.join(", "),
  );
  // The defect: one colour for all five. Distinctness is the half a
  // per-Type fallback would still satisfy.
  var painted = types.map(function (t) {
    return renderedBadgeStyle("metamodel", "Type=" + t);
  });
  assert.equal(
    new Set(painted).size,
    5,
    "five Types painted " + new Set(painted).size + " distinct badges",
  );
  types.forEach(function (t) {
    var f = byValue[t];
    assert.ok(
      renderedBadgeStyle("metamodel", "Type=" + t).indexOf(
        "background:" + expected(f.background, f.backgroundToken),
      ) >= 0,
      t +
        " should render background:" +
        expected(f.background, f.backgroundToken) +
        ", got " +
        renderedBadgeStyle("metamodel", "Type=" + t),
    );
  });
});
