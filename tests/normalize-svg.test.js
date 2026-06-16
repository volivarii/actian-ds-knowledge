"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeIconSvg } = require("../scripts/icons/normalize-svg");

const CLEAN = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 5h14v14H5z" fill="#0F5FDC"/></svg>';
const STROKE = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 12h16" stroke="#000000" stroke-width="2" fill="none"/></svg>';
const TWO_COLOR = '<svg viewBox="0 0 24 24"><path d="M0 0h12v24H0z" fill="#000000"/><path d="M12 0h12v24H12z" fill="#FF0000"/></svg>';
const GRADIENT = '<svg viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><path d="M5 5h14v14H5z" fill="url(#g)"/></svg>';
const BAD_VIEWBOX = '<svg viewBox="0 0 32 32"><path d="M5 5h14v14H5z" fill="#000"/></svg>';
const GROUPED = '<svg viewBox="0 0 24 24"><g transform="translate(2 2)"><path d="M0 0h20v20H0z" fill="#123456"/></g></svg>';

test("clean monochrome: ok, currentColor, stripped wrapper + dimensions, 24 viewBox", () => {
  const r = normalizeIconSvg(CLEAN);
  assert.equal(r.ok, true);
  assert.equal(r.viewBox, "0 0 24 24");
  assert.doesNotMatch(r.body, /<svg[\s>]/i, "no root <svg>");
  assert.doesNotMatch(r.body, /\b(width|height)=/, "no width/height");
  assert.match(r.body, /fill="currentColor"/);
  assert.doesNotMatch(r.body, /#0f5fdc/i, "hex fill rewritten");
});

test("stroke-based monochrome: stroke rewritten to currentColor", () => {
  const r = normalizeIconSvg(STROKE);
  assert.equal(r.ok, true);
  assert.match(r.body, /stroke="currentColor"/);
  assert.match(r.body, /fill="none"/, "fill=none preserved");
});

test("two distinct colors: degraded multicolor", () => {
  assert.deepEqual(normalizeIconSvg(TWO_COLOR), { ok: false, reason: "multicolor" });
});

test("gradient/url fill: degraded gradient-or-image-fill", () => {
  assert.deepEqual(normalizeIconSvg(GRADIENT), { ok: false, reason: "gradient-or-image-fill" });
});

test("non-24 viewBox: degraded bad-viewbox", () => {
  assert.deepEqual(normalizeIconSvg(BAD_VIEWBOX), { ok: false, reason: "bad-viewbox" });
});

test("grouped/transformed single color: ok (SVGO flattens), currentColor", () => {
  const r = normalizeIconSvg(GROUPED);
  assert.equal(r.ok, true);
  assert.match(r.body, /currentColor/);
  assert.doesNotMatch(r.body, /#123456/i);
});

test("empty / non-svg input: degraded empty", () => {
  assert.deepEqual(normalizeIconSvg(""), { ok: false, reason: "empty" });
  assert.deepEqual(normalizeIconSvg("   "), { ok: false, reason: "empty" });
  assert.deepEqual(normalizeIconSvg('<svg viewBox="0 0 24 24"></svg>'), { ok: false, reason: "empty" });
});
