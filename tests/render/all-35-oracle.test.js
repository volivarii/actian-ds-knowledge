"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var { RENDER_SLUGS } = require("../../components/render/renderer/matrix.js");
var { deriveFragment } = require("../../scripts/render/derive-from-renderer.js");

var SRC = path.resolve(__dirname, "../../components/render/src");

// Slugs whose generic-renderer output INTENTIONALLY improves on the degraded
// seed (the seed predates the tag/checkbox/radio/toggle fixes). Asserted to
// DIFFER and to carry the improvement marker.
var IMPROVED = {
  "tag-default": /ds-tag--teal/, // a color the degraded seed lacks
  checkbox: /ds-checkbox--(checked|indeterminate)/,
  "radio-button": /ds-radio--checked/,
  toggle: /ds-toggle--on/,
};

// Slugs whose seed is stale because a Figma sync changed facts AFTER capture.
// The derive reflects CURRENT facts, so it legitimately differs. Cause named.
var STALE = {
  "text-input": "seed label 'Hover' predates sync #439 (now 'Warning')",
  popover: "seed icon geometry predates a later icons.json sync",
  toolbar: "seed icon geometry predates a later icons.json sync",
};

function seedBody(slug) {
  var html = fs.readFileSync(path.join(SRC, slug + ".html"), "utf8");
  var m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (!m) throw new Error(slug + ": no <body> in seed");
  return m[1];
}

test("all 35 slugs classify as byte-identical, improved, or stale (no surprise drift)", function () {
  RENDER_SLUGS.forEach(function (slug) {
    var derived = deriveFragment(slug);
    var seed = seedBody(slug);
    if (slug in IMPROVED) {
      assert.notStrictEqual(derived, seed, slug + ": expected improved output to differ from the degraded seed");
      assert.match(derived, IMPROVED[slug], slug + ": improvement marker missing");
    } else if (slug in STALE) {
      assert.notStrictEqual(derived, seed, slug + ": expected stale seed to differ (" + STALE[slug] + ")");
    } else {
      assert.strictEqual(derived, seed, slug + ": derived fragment drifted from its seed unexpectedly (add to IMPROVED or STALE with a cause, or fix the renderer)");
    }
  });
});

test("the classification sets cover exactly the known non-identical slugs", function () {
  assert.strictEqual(Object.keys(IMPROVED).length, 4);
  assert.strictEqual(Object.keys(STALE).length, 3);
});
