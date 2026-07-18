"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.resolve(__dirname, "..", "..");
var SRC_DIR = path.join(ROOT, "components", "render", "src");

var D = require("../../scripts/render/derive-from-renderer.js");

// The seed's <body> inner markup, extracted locally so this test does not
// depend on scripts/render/derive-canonical.js.
function seedBodyInner(slug) {
  var html = fs.readFileSync(path.join(SRC_DIR, slug + ".html"), "utf8");
  var m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (!m) throw new Error("no <body> found in " + slug + " seed");
  return m[1];
}

test("deriveFragment(button) is byte-identical to the button seed's body inner", function () {
  var derived = D.deriveFragment("button");
  var seeded = seedBodyInner("button");
  assert.equal(derived, seeded);
});

// Two more BUILT slugs (not tag-default/checkbox, which are the known-buggy
// derive-from-facts captures), scaling the byte-identity proof beyond the
// simplest (icon-free) case.
["badge", "tag-interactive"].forEach(function (slug) {
  test(
    "deriveFragment(" + slug + ") is byte-identical to its seed's body inner",
    function () {
      var derived = D.deriveFragment(slug);
      var seeded = seedBodyInner(slug);
      assert.equal(derived, seeded);
    },
  );
});

// tag-default and checkbox are the derive-from-facts slugs (North Star slice
// 2): their markup INTENTIONALLY diverges from the degraded seed (colored tag
// classes; real checkbox state classes + glyphs), so they are asserted
// positively rather than pinned to seed byte-identity.
test("deriveFragment(tag-default) colors each cell via ds-tag--<color>", function () {
  var derived = D.deriveFragment("tag-default");
  assert.match(derived, /ds-tag--pink/);
});

test("deriveFragment(checkbox) emits distinct classes + glyphs per Selection state", function () {
  var derived = D.deriveFragment("checkbox");
  assert.match(derived, /ds-checkbox--checked/);
  assert.match(derived, /ds-checkbox--indeterminate/);
  assert.match(
    derived,
    /<rect x="5" y="11" width="14" height="2" rx="1" fill="currentColor"\/>/,
  );
  assert.match(derived, /is-disabled/);
});

var R = require("../../scripts/render/derive-from-renderer.js");

test("radio-button derives a real Selected state, not the Selected==='Yes' bug", function () {
  var html = R.deriveFragment("radio-button");
  assert.match(
    html,
    /ds-radio--checked/,
    "the Selected cell emits ds-radio--checked",
  );
  assert.match(
    html,
    /ds-radio\b[^"]*\bis-disabled/,
    "the Disabled cell emits is-disabled",
  );
});

test("toggle derives a real On state, not the Selected==='Yes' bug", function () {
  var html = R.deriveFragment("toggle");
  assert.match(html, /ds-toggle--on/, "the On cell emits ds-toggle--on");
  assert.match(
    html,
    /ds-toggle\b[^"]*\bis-disabled/,
    "the Disabled cell emits is-disabled",
  );
});

test("tag-default renders every registry color, not the 5-cell generic cap", function () {
  var html = R.deriveFragment("tag-default");
  [
    "pink",
    "purple",
    "indigo",
    "yellow",
    "lime",
    "teal",
    "orange",
    "gray",
  ].forEach(function (c) {
    assert.match(
      html,
      new RegExp("ds-tag--" + c + "\\b"),
      "tag color " + c + " is rendered",
    );
  });
});
