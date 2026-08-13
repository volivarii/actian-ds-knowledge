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
  assert.doesNotMatch(r.body, /\s(width|height)=/, "no width/height");
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
  // stroke-width is legitimate geometry — the width/height guard must not fire
  // on it (a `\b` boundary would wrongly match `-width=`). Regression for the
  // favorite-filled backfill failure.
  assert.match(r.body, /stroke-width=/, "stroke-width preserved");
  assert.doesNotMatch(
    r.body,
    /\swidth=/,
    "stroke-width is not a width= presentation attr",
  );
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
  assert.doesNotMatch(r.body, /\s(width|height)=/, "no width/height");
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

// Ticking "Clip content" on an icon's Figma frame makes the export wrap the
// glyph in <g clip-path="url(#clipN)"> plus a <defs> clipPath whose rect covers
// the WHOLE viewBox, so it crops nothing. The url(#…) guard is about paints
// ("gradients / pattern / image … can't become currentColor"), but its regex
// matched any url reference, so a clip reference degraded a perfectly monochrome
// glyph. That is how lifecycle-policy became a "lost icon" in the 2026-08-13
// sync (#526) without anyone touching the artwork.
//
// Verbatim Figma export of lifecycle-policy (node 13315:9276), trimmed to two of
// its five paths. The wrapper and defs are exactly as Figma emits them.
const NOOP_CLIP = [
  '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">',
  '<g clip-path="url(#clip0_13315_9276)">',
  '<path d="M24 33L20.792 31.481C18.1845 30.2475 16.5 27.5859 16.5 24.7017V15H31.5V24.7017C31.5 27.5861 29.8155 30.2477 27.2081 31.481L24 33ZM19.5 18V24.7017C19.5 26.4317 20.5107 28.0284 22.0752 28.768L24 29.6792L25.9248 28.768C27.4893 28.0282 28.5 26.4317 28.5 24.7017V18H19.5Z" fill="black"/>',
  '<path d="M6.1812 26.4843C6.97695 25.9452 7.5 25.0333 7.5 24C7.5 22.3432 6.15675 21 4.5 21C2.84325 21 1.5 22.3432 1.5 24C1.5 25.1829 2.19105 26.1966 3.186 26.685C4.2048 34.686 9.7068 41.4565 17.5389 43.987L18.4609 41.1321C11.8077 38.9832 7.11465 33.2628 6.1812 26.4843Z" fill="black"/>',
  "</g>",
  '<defs><clipPath id="clip0_13315_9276">',
  '<rect width="24" height="24" fill="white" transform="scale(2)"/>',
  "</clipPath></defs></svg>",
].join("\n");

// Same wrapper, but the clip rect covers a quarter of the viewBox, so it really
// does crop. Dropping THAT silently would ship a glyph that is not what Figma
// draws, so it must stay degraded.
const CROPPING_CLIP =
  '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<g clip-path="url(#clip0_crop)"><path d="M4 4h40v40H4z" fill="black"/></g>' +
  '<defs><clipPath id="clip0_crop"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>';

test("no-op full-bleed clip wrapper: ok, clip dropped, not gradient-or-image-fill", () => {
  const r = normalizeIconSvg(NOOP_CLIP);
  assert.equal(
    r.ok,
    true,
    "a monochrome glyph behind a no-op clip is shippable",
  );
  assert.equal(r.viewBox, "0 0 48 48");
  assert.match(r.body, /fill="currentColor"/);
  assert.doesNotMatch(r.body, /clip-path=/i, "clip reference dropped");
  assert.doesNotMatch(r.body, /<clipPath|<defs/i, "orphaned clip def dropped");
  assert.doesNotMatch(
    r.body,
    /"white"|"black"/i,
    "no raw paint survives, including the clip rect's own white fill",
  );
});

test("clip that genuinely crops: still degraded, never silently unclipped", () => {
  assert.deepEqual(normalizeIconSvg(CROPPING_CLIP), {
    ok: false,
    reason: "gradient-or-image-fill",
  });
});
