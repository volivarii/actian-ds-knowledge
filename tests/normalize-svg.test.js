"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeIconSvg } = require("../scripts/icons/normalize-svg");

const CLEAN =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 5h14v14H5z" fill="#0F5FDC"/></svg>';
const STROKE =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 12h16" stroke="#000000" stroke-width="2" fill="none"/></svg>';
const TWO_COLOR =
  '<svg viewBox="0 0 24 24"><path d="M0 0h12v24H0z" fill="#000000"/><path d="M12 0h12v24H12z" fill="#FF0000"/></svg>';
const GRADIENT =
  '<svg viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><path d="M5 5h14v14H5z" fill="url(#g)"/></svg>';
const BAD_VIEWBOX =
  '<svg viewBox="0 0 24 32"><path d="M5 5h14v14H5z" fill="#000"/></svg>';
const NONZERO_VIEWBOX =
  '<svg viewBox="2 2 24 24"><path d="M5 5h14v14H5z" fill="#000"/></svg>';
const SQUARE_48 =
  '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 10h28v28H10z" fill="#1A1A1A"/></svg>';
const GROUPED =
  '<svg viewBox="0 0 24 24"><g transform="translate(2 2)"><path d="M0 0h20v20H0z" fill="#123456"/></g></svg>';

test("clean monochrome: ok, currentColor, stripped wrapper + dimensions, 24 viewBox", () => {
  const r = normalizeIconSvg(CLEAN);
  assert.equal(r.ok, true);
  assert.equal(r.viewBox, "0 0 24 24");
  assert.doesNotMatch(r.body, /<svg[\s>]/i, "no root <svg>");
  assert.doesNotMatch(r.body, /\b(width|height)=/, "no width/height");
  assert.match(r.body, /fill="currentColor"/);
  assert.doesNotMatch(r.body, /#0f5fdc/i, "hex fill rewritten");
  assert.doesNotMatch(
    r.body,
    /\/\s+\w+=/,
    "no attribute after a self-closing slash",
  );
  assert.doesNotMatch(r.body, /\/[^>]*\s\w+=/, "no attribute after a slash");
});

test("stroke-based monochrome: stroke rewritten to currentColor", () => {
  const r = normalizeIconSvg(STROKE);
  assert.equal(r.ok, true);
  assert.match(r.body, /stroke="currentColor"/);
  assert.match(r.body, /fill="none"/, "fill=none preserved");
});

test("two distinct colors: degraded multicolor", () => {
  assert.deepEqual(normalizeIconSvg(TWO_COLOR), {
    ok: false,
    reason: "multicolor",
  });
});

test("gradient/url fill: degraded gradient-or-image-fill", () => {
  assert.deepEqual(normalizeIconSvg(GRADIENT), {
    ok: false,
    reason: "gradient-or-image-fill",
  });
});

test("non-square viewBox: degraded bad-viewbox", () => {
  assert.deepEqual(normalizeIconSvg(BAD_VIEWBOX), {
    ok: false,
    reason: "bad-viewbox",
  });
});

test("non-origin viewBox: degraded bad-viewbox", () => {
  assert.deepEqual(normalizeIconSvg(NONZERO_VIEWBOX), {
    ok: false,
    reason: "bad-viewbox",
  });
});

test("square 48x48 (Figma's real icon export): ok, viewBox PRESERVED, currentColor", () => {
  const r = normalizeIconSvg(SQUARE_48);
  assert.equal(r.ok, true);
  assert.equal(
    r.viewBox,
    "0 0 48 48",
    "non-24 square viewBox is preserved, not forced to 24",
  );
  assert.match(r.body, /fill="currentColor"/);
  assert.doesNotMatch(r.body, /#1a1a1a/i, "hex fill rewritten");
  assert.doesNotMatch(r.body, /\b(width|height)=/, "no width/height");
});

test("grouped/transformed single color: ok (SVGO flattens), currentColor", () => {
  const r = normalizeIconSvg(GROUPED);
  assert.equal(r.ok, true);
  assert.match(r.body, /currentColor/);
  assert.doesNotMatch(r.body, /#123456/i);
  assert.doesNotMatch(
    r.body,
    /\/\s+\w+=/,
    "no attribute after a self-closing slash",
  );
  assert.doesNotMatch(r.body, /\/[^>]*\s\w+=/, "no attribute after a slash");
});

test("empty / non-svg input: degraded empty", () => {
  assert.deepEqual(normalizeIconSvg(""), { ok: false, reason: "empty" });
  assert.deepEqual(normalizeIconSvg("   "), { ok: false, reason: "empty" });
  assert.deepEqual(normalizeIconSvg('<svg viewBox="0 0 24 24"></svg>'), {
    ok: false,
    reason: "empty",
  });
});

const SINGLE_BLACK =
  '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z" fill="#000000"/></svg>';
const IMPLICIT_BLACK =
  '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/></svg>';

test("single black-fill icon: ok, fill rewritten to currentColor, no #000000", () => {
  const r = normalizeIconSvg(SINGLE_BLACK);
  assert.equal(r.ok, true);
  assert.match(r.body, /fill="currentColor"/);
  assert.doesNotMatch(r.body, /#000000/i, "no residual #000000");
  assert.doesNotMatch(r.body, /#000\b/i, "no residual #000 shorthand");
  assert.doesNotMatch(
    r.body,
    /\/\s+\w+=/,
    "no attribute after a self-closing slash",
  );
  assert.match(
    r.body,
    /<path\b[^>]*\bfill="currentColor"\s*\/?>/,
    "fill is inside the path tag",
  );
  assert.doesNotMatch(r.body, /\/[^>]*\s\w+=/, "no attribute after a slash");
});

test("implicit black shape (no fill/stroke attr): ok, fill injected as currentColor", () => {
  const r = normalizeIconSvg(IMPLICIT_BLACK);
  assert.equal(r.ok, true);
  assert.match(r.body, /fill="currentColor"/);
  assert.doesNotMatch(
    r.body,
    /\/\s+\w+=/,
    "no attribute after a self-closing slash",
  );
  assert.match(
    r.body,
    /<path\b[^>]*\bfill="currentColor"\s*\/?>/,
    "fill is inside the path tag",
  );
  assert.doesNotMatch(r.body, /\/[^>]*\s\w+=/, "no attribute after a slash");
});

const STYLE_BLACK =
  '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z" style="fill:#000000"/></svg>';
const STYLE_TWO =
  '<svg viewBox="0 0 24 24"><path d="M0 0h12v24H0z" style="fill:#0000FF"/><path d="M12 0h12v24H12z" style="fill:#FF0000"/></svg>';

test("style= paint: single color → currentColor, no residual style fill", () => {
  const r = normalizeIconSvg(STYLE_BLACK);
  assert.equal(r.ok, true);
  assert.match(r.body, /fill="currentColor"/);
  assert.doesNotMatch(
    r.body,
    /style="[^"]*fill/i,
    "no residual style-based fill paint",
  );
});

test("style= paint, two distinct colors → multicolor", () => {
  assert.deepEqual(normalizeIconSvg(STYLE_TWO), {
    ok: false,
    reason: "multicolor",
  });
});
