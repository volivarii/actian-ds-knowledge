"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var ROOT = path.resolve(__dirname, "..", "..");

test("relocated renderer modules are present and manifest-covered (no orphans)", function () {
  var dir = path.join(ROOT, "components/render/renderer");
  [
    "ds-anatomy-map.js",
    "anatomy-render.js",
    "appearance-render.js",
    "appearance-style.js",
    "default-props.json",
    "html-renderers/ds-html-map.js",
    "html-renderers/anatomy-variant-key.js",
    "html-renderers/fm-html-map.js",
  ].forEach(function (rel) {
    assert.ok(fs.existsSync(path.join(dir, rel)), rel + " present");
  });
  // The manifest collection must be recursive so the html-renderers/ subdir is covered.
  var manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "paths-manifest.json"), "utf8"),
  );
  var coll = manifest.collections["components.render.renderer"];
  assert.equal(coll.dir, "components/render/renderer");
  assert.equal(
    coll.recursive,
    true,
    "collection must recurse into html-renderers/",
  );
});

test("anatomy-render + ds-anatomy-map require cleanly in knowledge (no lib/paths)", function () {
  assert.doesNotThrow(function () {
    require("../../components/render/renderer/anatomy-render.js");
  }, "anatomy-render loads without lib/paths");
  assert.doesNotThrow(function () {
    require("../../components/render/renderer/ds-anatomy-map.js");
  }, "ds-anatomy-map loads without lib/paths");
});

test("anatomy loader is honored when injected (no PATHS fallback needed)", function () {
  var AR = require("../../components/render/renderer/anatomy-render.js");
  var sentinel = { slug: "x", root: { appearance: {} } };
  var got = AR.loadAnatomy("x", function () {
    return sentinel;
  });
  assert.equal(
    got,
    sentinel,
    "injected loader wins, no filesystem/PATHS touched",
  );
});
