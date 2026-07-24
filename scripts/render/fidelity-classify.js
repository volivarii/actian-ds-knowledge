"use strict";
// Pure classification helpers for the render fidelity report. No filesystem,
// no repo layout knowledge, so the rules below can be unit-tested directly.
//
// The fidelity invariant is a COLOR invariant: the appearance facts captured
// from Figma carry background, border, and text colors and nothing else.
// Applying it to every declaration produced 1446 findings dominated by
// "--zen-spacing-2xs=4px does not round-trip", a spacing token checked against
// a color set. Everything here exists to keep the comparison to like-for-like.

// Properties whose value IS a color.
var COLOR_PROPS =
  /^(background-color|color|border-color|border-(top|bottom|left|right)-color|fill|stroke|outline-color)$/;
// Properties whose value CONTAINS a color among other components.
var SHORTHAND_PROPS =
  /^(background|border|border-(top|bottom|left|right)|outline)$/;
var HEX = /^#[0-9a-fA-F]{3,8}$/;

// A state the default-variant capture cannot address by construction. There is
// no fact to compare against, so these are unverifiable rather than suspect.
var STATE_RE =
  /:hover|:focus|:active|:disabled|:checked|:not|::|\.is-|--selected|--expanded|--open|--active|--hover|--focus|\[aria-|\[disabled|\[data-/;

// The color component of a declaration, or null when there is not one.
//
// A shorthand is scanned for the first var() whose RESOLVED value is a hex.
// Reading the first var() unconditionally picked the WIDTH out of
// `border: var(--zen-border-width-md) solid var(--zen-border-default)` and
// compared "1px" against a captured hex, a false mismatch every time.
function colorOf(prop, value, tokenMap) {
  var p = String(prop).toLowerCase();
  if (!COLOR_PROPS.test(p) && !SHORTHAND_PROPS.test(p)) return null;
  var vre = /var\(\s*(--zen-[a-z0-9-]+)\s*\)/gi;
  var m;
  while ((m = vre.exec(value)) !== null) {
    var resolved = tokenMap[m[1]];
    if (resolved && HEX.test(String(resolved).trim()))
      return { token: m[1], resolved: String(resolved).trim() };
  }
  var h = /#[0-9a-fA-F]{3,8}\b/.exec(value);
  if (h) return { token: null, resolved: h[0] };
  return null;
}

// Which kind of captured fact a property should be compared against.
function kindOf(prop) {
  var p = String(prop).toLowerCase();
  if (/^background/.test(p)) return "background";
  if (/^(color|fill)$/.test(p)) return "text";
  if (/^(border|outline|stroke)/.test(p)) return "border";
  return null;
}

// The compound selector a rule actually paints: the last one in the first
// comma-separated alternative. A descendant selector's subject is its right
// end, never its left.
function rightmost(selector) {
  var first = String(selector).split(",")[0].trim();
  var parts = first.split(/\s*>\s*|\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : first;
}

// Bucket a rule by what it targets, relative to the prefix that owns it.
function classifySelector(selector, prefix) {
  if (STATE_RE.test(selector)) return { bucket: "state" };
  var target = rightmost(selector);
  if (new RegExp("\\." + prefix + "__").test(target)) return { bucket: "element" };
  // A BEM element of ANY ds-* prefix is still an element, not this prefix's
  // root: `.ds-tag--indigo .ds-tag-stage__dot` is owned by ds-tag but paints a
  // ds-tag-stage element.
  if (/\.ds-[a-z0-9-]+__/.test(target)) return { bucket: "element" };
  var mod = new RegExp("^\\." + prefix + "--([a-z0-9-]+)$").exec(target);
  if (mod) return { bucket: "modifier", modifier: mod[1] };
  if (new RegExp("^\\." + prefix + "$").test(target)) return { bucket: "root" };
  return { bucket: "other" };
}

module.exports = {
  colorOf: colorOf,
  kindOf: kindOf,
  rightmost: rightmost,
  classifySelector: classifySelector,
  COLOR_PROPS: COLOR_PROPS,
  SHORTHAND_PROPS: SHORTHAND_PROPS,
  STATE_RE: STATE_RE,
};
