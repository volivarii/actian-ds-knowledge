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
    // No reader in this repo, but the plugin's fidelity harness reads it out of
    // the vendored tree at module load and unguarded, so its absence is a red
    // plugin PR on the next vendor snapshot. This assertion is what guards that
    // vendored contract.
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

test("ds-html-map renderIcon uses an injected icon map", function () {
  var M = require("../../components/render/renderer/html-renderers/ds-html-map.js");
  assert.equal(typeof M.setIcons, "function", "setIcons seam present");
  M.setIcons({
    "chevron-down": { viewBox: "0 0 24 24", body: '<path d="M1 1"/>' },
  });
  var html = M.renderIcon("chevron-down");
  assert.match(
    html,
    /<svg[^>]*viewBox="0 0 24 24"/,
    "emits the injected geometry",
  );
  assert.match(html, /M1 1/, "emits the injected body");
  M.setIcons(null); // reset module state (leak discipline, like setAnatomyDocMap)
});

test("loadAnatomy degrades to null with no loader and no lib/paths", function () {
  // The DI premise made evidence, not just inspection: with no injected loader
  // and no lib/paths in knowledge, the severed default reader must return null
  // (an honest "no anatomy"), never throw.
  var AR = require("../../components/render/renderer/anatomy-render.js");
  assert.equal(
    AR.loadAnatomy("nonexistent-slug"),
    null,
    "null PATHS + no loader returns null, never throws",
  );
});
