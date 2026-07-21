"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var {
  normalizeGraphicSvg,
} = require("../../scripts/graphics/normalize-graphics-svg.js");

test("keeps multicolor fills verbatim (the inverse of the icon rule)", function () {
  var raw =
    '<svg width="200" height="200" viewBox="0 0 200 200">' +
    '<path fill="#0F5FDC" d="M1 1h10v10H1z"/>' +
    '<path fill="#1B7F3B" d="M20 1h10v10H20z"/></svg>';
  var out = normalizeGraphicSvg(raw);
  assert.equal(out.ok, true);
  assert.equal(out.viewBox, "0 0 200 200");
  assert.match(out.body, /#0F5FDC/);
  assert.match(out.body, /#1B7F3B/);
  assert.doesNotMatch(out.body, /currentColor/);
});

test("keeps a gradient definition, its stop-color, and the shape's url() reference", function () {
  var raw =
    '<svg viewBox="0 0 10 10"><defs><linearGradient id="g">' +
    '<stop offset="0" stop-color="#fff"/></linearGradient></defs>' +
    '<rect fill="url(#g)" width="10" height="10"/></svg>';
  var out = normalizeGraphicSvg(raw);
  assert.equal(out.ok, true);
  assert.match(out.body, /linearGradient/);
  // SVGO's cleanupIds may rename the id, so match the shape (a url(#...)
  // reference plus a surviving stop-color), not the literal original id.
  assert.match(out.body, /url\(#[^)]+\)/);
  assert.match(out.body, /stop-color\s*=\s*["']#fff["']/);
});

test("keeps fill color that removeUnknownsAndDefaults would otherwise strip", function () {
  var raw =
    '<svg viewBox="0 0 10 10"><path fill="#000" d="M0 0h1v1H0z"/></svg>';
  var out = normalizeGraphicSvg(raw);
  assert.equal(out.ok, true);
  assert.match(out.body, /#000|black/);
});

test("does not misclassify a nested self-closed <svg/> viewport child as empty", function () {
  var raw =
    '<svg viewBox="0 0 100 100"><path fill="#123456" d="M0 0h10v10H0z"/>' +
    '<svg x="10" y="10" width="5" height="5" viewBox="0 0 5 5"/></svg>';
  var out = normalizeGraphicSvg(raw);
  assert.equal(out.ok, true);
  assert.match(out.body, /#123456/);
});

test("strips width/height and Figma metadata but keeps viewBox", function () {
  var raw =
    '<svg width="48" height="48" viewBox="0 0 48 48" data-figma="x">' +
    '<path fill="#000" d="M0 0h1v1H0z"/></svg>';
  var out = normalizeGraphicSvg(raw);
  assert.equal(out.ok, true);
  assert.equal(out.viewBox, "0 0 48 48");
  assert.doesNotMatch(out.body, /data-figma/);
});

test("flags an embedded raster as raster-backed, does not ship it", function () {
  var raw =
    '<svg viewBox="0 0 10 10">' +
    '<image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/></svg>';
  var out = normalizeGraphicSvg(raw);
  assert.equal(out.ok, false);
  assert.equal(out.reason, "raster-backed");
});

test("empty body is rejected", function () {
  assert.equal(
    normalizeGraphicSvg("<svg viewBox='0 0 1 1'></svg>").reason,
    "empty",
  );
});

test("missing viewBox is rejected", function () {
  assert.equal(
    normalizeGraphicSvg('<svg><path d="M0 0h1v1H0z"/></svg>').reason,
    "bad-viewbox",
  );
});

test("whitespace-only viewBox is rejected", function () {
  assert.equal(
    normalizeGraphicSvg('<svg viewBox="   "><path d="M0 0h1v1H0z"/></svg>')
      .reason,
    "bad-viewbox",
  );
});
