"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var map = require("../../components/render/renderer/html-renderers/ds-html-map.js");

test("renderGraphic inlines an injected artwork body, or empty for unknown", function () {
  assert.equal(typeof map.setGraphics, "function");
  map.setGraphics({ probe: { viewBox: "0 0 40 40", body: '<path fill="#0F5FDC" d="M1 1h2v2H1z"/>' } });
  try {
    var svg = map.renderGraphic("probe");
    assert.match(svg, /class="ds-graphic"/);
    assert.match(svg, /viewBox="0 0 40 40"/);
    assert.match(svg, /#0F5FDC/);
    assert.equal(map.renderGraphic("no-such-graphic"), "");
  } finally {
    map.setGraphics(null);
  }
});

test("setGraphics(null) clears the injection", function () {
  map.setGraphics({ probe: { viewBox: "0 0 1 1", body: "<path/>" } });
  map.setGraphics(null);
  assert.equal(map.renderGraphic("probe"), "");
});
