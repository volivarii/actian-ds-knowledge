"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var ar = require("../../components/render/renderer/appearance-render.js");

test("appearance-render exposes an icon injection seam", function () {
  assert.equal(
    typeof ar.setIcons,
    "function",
    "phase 1a gave ds-html-map a setIcons seam and missed this module, so " +
      "consumers had to monkey-patch the exports object",
  );
  assert.equal(typeof ar.setShadowedSlugs, "function");
});

test("an injected icon map is used by renderIconGlyph", function () {
  var glyph = { viewBox: "0 0 24 24", body: '<path d="M1 1 L2 2"/>' };
  ar.setIcons({ probe: glyph });
  try {
    var svg = ar.renderIconGlyph({ slug: "probe" }, null, {});
    assert.ok(svg && /M1 1 L2 2/.test(svg), "injected glyph not rendered");
  } finally {
    ar.setIcons(null);
  }
});

test("setIcons(null) restores the module default", function () {
  ar.setIcons({ probe: { viewBox: "0 0 1 1", body: "<path/>" } });
  ar.setIcons(null);
  assert.equal(
    ar.renderIconGlyph({ slug: "probe" }, null, {}),
    null,
    "the injected map leaked after reset",
  );
});

test("an injected shadowed list suppresses a glyph, and resetting restores it", function () {
  var glyph = { viewBox: "0 0 24 24", body: '<path d="M3 3 L4 4"/>' };
  ar.setIcons({ shadowed: glyph });
  try {
    // Baseline: with no shadowed list injected, the glyph renders.
    assert.ok(
      ar.renderIconGlyph({ slug: "shadowed" }, null, {}),
      "glyph should render before a shadowed list is injected",
    );
    ar.setShadowedSlugs(["shadowed"]);
    assert.equal(
      ar.renderIconGlyph({ slug: "shadowed" }, null, {}),
      null,
      "an injected shadowed slug must suppress the glyph",
    );
    ar.setShadowedSlugs(null);
    assert.ok(
      ar.renderIconGlyph({ slug: "shadowed" }, null, {}),
      "resetting setShadowedSlugs(null) must restore the glyph",
    );
  } finally {
    ar.setIcons(null);
    ar.setShadowedSlugs(null);
  }
});

test("an explicit opts.iconMap still beats an injected map", function () {
  ar.setIcons({ probe: { viewBox: "0 0 1 1", body: "<path/>" } });
  try {
    var explicitGlyph = { viewBox: "0 0 9 9", body: '<path d="M9 9 L8 8"/>' };
    var svg = ar.renderIconGlyph(
      { slug: "probe" },
      null,
      { iconMap: { probe: explicitGlyph } },
    );
    assert.ok(
      svg && /M9 9 L8 8/.test(svg),
      "an explicit opts.iconMap must win over the injected map",
    );
  } finally {
    ar.setIcons(null);
  }
});
