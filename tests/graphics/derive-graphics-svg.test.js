"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var { deriveGraphics } = require("../../scripts/graphics/derive-graphics-svg.js");
var { validateGraphics } = require("../../scripts/validate/validate-graphics.js");

test("derive produces a slug -> {viewBox, body} read-surface", function () {
  var out = deriveGraphics({
    "actian-pyramid": { viewBox: "0 0 40 40", body: '<path fill="#0F5FDC" d="M0 0h1v1H0z"/>' },
  });
  assert.equal(out.count, 1);
  assert.equal(out.graphics["actian-pyramid"].viewBox, "0 0 40 40");
});

test("validator accepts multicolor and an internal gradient/use reference", function () {
  assert.equal(validateGraphics({ a: { viewBox: "0 0 1 1", body: '<path fill="#0F5FDC"/>' } }).ok, true);
  // url(#id) gradient refs and href="#id" fragment refs are INTERNAL and legal;
  // real Figma artwork (the pyramid) uses url(#gradient), and future artwork may
  // use <use href="#part">. The gate must not reject these.
  assert.equal(validateGraphics({ a: { viewBox: "0 0 1 1", body: '<rect fill="url(#g)"/><defs><linearGradient id="g"/></defs>' } }).ok, true);
  assert.equal(validateGraphics({ a: { viewBox: "0 0 1 1", body: '<use href="#part"/>' } }).ok, true);
});

test("validator rejects an EXTERNAL reference (a url or filename), not an internal fragment", function () {
  var img = validateGraphics({ a: { viewBox: "0 0 1 1", body: '<image href="x.png"/>' } });
  assert.equal(img.ok, false);
  assert.match(img.errors.join(), /external reference/i);
  assert.equal(validateGraphics({ a: { viewBox: "0 0 1 1", body: '<image src="y.jpg"/>' } }).ok, false);
  assert.equal(validateGraphics({ a: { viewBox: "0 0 1 1", body: '<style>@import url("z.css")</style>' } }).ok, false);
});

test("validator rejects an empty body", function () {
  assert.equal(validateGraphics({ a: { viewBox: "0 0 1 1", body: "" } }).ok, false);
});
