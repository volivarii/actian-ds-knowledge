"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.resolve(__dirname, "..", "..");
var SRC_DIR = path.join(ROOT, "components", "render", "src");

var D = require("../../scripts/render/derive-from-renderer.js");

// The seed's <body> inner markup: the same extraction derive-canonical.js uses
// (bodyInner), reproduced here so this test does not depend on that module.
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
