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
// A gradient function. A gradient has no single color, so it is caught up
// front in colorOf before any stop is scanned.
var GRADIENT_RE = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/i;

// A state the default-variant capture cannot address by construction. There is
// no fact to compare against, so these are unverifiable rather than suspect.
// Structural pseudo-classes (:first-child, :nth-child(), etc.) belong here
// too: they address a positional state of the same kind, one the default
// single-instance capture cannot reach.
var STATE_RE =
  /:hover|:focus|:active|:disabled|:checked|:not|::|\.is-|--selected|--expanded|--open|--active|--hover|--focus|\[aria-|\[disabled|\[data-|:first-child|:last-child|:nth-child|:only-child|:first-of-type|:last-of-type|:nth-of-type/;

// The color component of a declaration, or null when there is not one.
//
// A shorthand is scanned for the first var() whose RESOLVED value is a hex.
// Reading the first var() unconditionally picked the WIDTH out of
// `border: var(--zen-border-width-md) solid var(--zen-border-default)` and
// compared "1px" against a captured hex, a false mismatch every time.
function colorOf(prop, value, tokenMap) {
  var p = String(prop).toLowerCase();
  if (!COLOR_PROPS.test(p) && !SHORTHAND_PROPS.test(p)) return null;
  // A gradient is not a single color: it is a function of multiple stops
  // blended across an axis. Picking a representative stop (the first var(),
  // as the scan below does for a plain shorthand) would be a confident WRONG
  // answer, not a conservative unverifiable one, so bail out to null instead.
  if (GRADIENT_RE.test(value)) return null;
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
  if (new RegExp("\\." + prefix + "__").test(target))
    return { bucket: "element" };
  // A BEM element of ANY ds-* prefix is still an element, not this prefix's
  // root: `.ds-tag--indigo .ds-tag-stage__dot` is owned by ds-tag but paints a
  // ds-tag-stage element.
  if (/\.ds-[a-z0-9-]+__/.test(target)) return { bucket: "element" };
  var mod = new RegExp("^\\." + prefix + "--([a-z0-9-]+)$").exec(target);
  if (mod) return { bucket: "modifier", modifier: mod[1] };
  if (new RegExp("^\\." + prefix + "$").test(target)) return { bucket: "root" };
  return { bucket: "other" };
}

function stripComments(s) {
  return String(s).replace(/\/\*[\s\S]*?\*\//g, "");
}

// The captured fact of a given kind for a node (or a variant entry, which
// carries the same appearance shape).
function factOf(node, kind) {
  var a = node || {};
  if (kind === "background") return a.background || null;
  if (kind === "border") return (a.border && a.border.color) || null;
  if (kind === "text") return (a.text && a.text.color) || null;
  return null;
}

// Every rule in `css` whose selector matches one of `prefixes`, tagged with
// the prefix that claimed it. Same selector regex consumedVars uses, so a
// single trailing hyphen is rejected and `.ds-loader` does not absorb
// `.ds-loader-with-logo`.
function ownedRules(css, prefixes) {
  var out = [];
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  while ((m = re.exec(css)) !== null) {
    var selector = m[1].trim();
    for (var i = 0; i < prefixes.length; i++) {
      var selRe = new RegExp("\\." + prefixes[i] + "(?![a-z0-9])(?!-(?!-))");
      if (selRe.test(selector)) {
        out.push({ selector: selector, body: m[2], prefix: prefixes[i] });
        break;
      }
    }
  }
  return out;
}

// Classify every color declaration in one slug's owned rules into exactly one
// of verified / mismatch / unverifiable.
//
// Conservative by construction. A false unverifiable understates our coverage
// honestly; a false mismatch produces a bug list nobody trusts, and a
// distrusted gate gets widened, which is the failure feedback_never_silence_a_signal
// exists to prevent. Every branch that cannot name a confident subject returns
// unverifiable with a reason, and the reasons are reported so the gaps are
// visible rather than rounded away.
function classifySlug(opts) {
  var slug = opts.slug;
  var prefixes = opts.prefixes;
  var facts = opts.facts;
  var tokenMap = opts.tokenMap || {};
  var sharedPrefixes = opts.sharedPrefixes || {};

  var result = {
    slug: slug,
    prefixes: prefixes.slice(),
    verified: 0,
    mismatch: 0,
    unverifiable: 0,
    mismatches: [],
    reasons: {},
  };
  function unverifiable(reason) {
    result.unverifiable++;
    result.reasons[reason] = (result.reasons[reason] || 0) + 1;
  }

  var rootNode =
    facts && facts.byNode && facts.byNode.length
      ? facts.byNode[0].appearance
      : null;
  var variants = (rootNode && rootNode.variants) || [];
  var rootIsVariantInstance = variants.length > 0;

  ownedRules(stripComments(opts.css), prefixes).forEach(function (rule) {
    var shared = (sharedPrefixes[rule.prefix] || []).length > 1;
    var cls = classifySelector(rule.selector, rule.prefix);

    rule.body.split(";").forEach(function (decl) {
      var idx = decl.indexOf(":");
      if (idx < 0) return;
      var prop = decl.slice(0, idx).trim().toLowerCase();
      var color = colorOf(prop, decl.slice(idx + 1).trim(), tokenMap);
      if (!color) return;
      var kind = kindOf(prop);
      if (!kind) return;

      if (!rootNode) return unverifiable("no-capture");
      if (cls.bucket === "state") return unverifiable("state-unreachable");
      if (cls.bucket === "element")
        return unverifiable("element-no-node-mapping");
      if (cls.bucket === "other")
        return unverifiable("selector-not-attributable");

      var target = null;
      if (cls.bucket === "modifier") {
        var wanted = cls.modifier.toLowerCase();
        target =
          variants.find(function (v) {
            return (v.values || []).some(function (val) {
              return String(val).toLowerCase().replace(/\s+/g, "-") === wanted;
            });
          }) || null;
        if (!target) return unverifiable("no-matching-variant");
      } else {
        // bucket === "root"
        if (shared) return unverifiable("shared-base-no-single-subject");
        if (rootIsVariantInstance)
          return unverifiable("root-is-variant-instance");
        target = rootNode;
      }

      var fact = factOf(target, kind);
      if (!fact) return unverifiable("no-fact-of-kind");

      if (String(fact).toLowerCase() === String(color.resolved).toLowerCase()) {
        result.verified++;
      } else {
        result.mismatch++;
        result.mismatches.push({
          slug: slug,
          selector: rule.selector,
          property: prop,
          token: color.token,
          painted: color.resolved,
          fact: fact,
          message:
            slug +
            " " +
            rule.selector +
            " {" +
            prop +
            "}: paints " +
            (color.token ? color.token + "=" : "") +
            color.resolved +
            " but the capture says " +
            fact,
        });
      }
    });
  });

  return result;
}

module.exports = {
  colorOf: colorOf,
  kindOf: kindOf,
  rightmost: rightmost,
  classifySelector: classifySelector,
  classifySlug: classifySlug,
  ownedRules: ownedRules,
  factOf: factOf,
  COLOR_PROPS: COLOR_PROPS,
  SHORTHAND_PROPS: SHORTHAND_PROPS,
  STATE_RE: STATE_RE,
};
