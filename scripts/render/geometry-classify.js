"use strict";

// GEOMETRY fidelity: does the stylesheet state the SHAPE the capture measured?
//
// The colour oracle (fidelity-classify.js) reads the capture's `appearance`
// object and stops there, so every one of the 447 declarations it examines is a
// colour. The capture also measures shape -- `layout.gap`, `layout.padding`,
// `layout.size` on every node, and `gapToken` / `paddingTokens` naming the
// design token many of those values came from -- and until this file nothing
// read any of it. The defects that kept surfacing were the ones it would have
// seen: a header logo drawing 13.9px into a 121px box has no colour out of
// place at all, and it took a browser and an eye.
//
// This deliberately REUSES fidelity-classify's selector machinery rather than
// restating it. `ownedRules`, `classifySelector`, `classCount` and
// `rootIsNonDefaultState` carry corrections that were each paid for once
// already (a grouped selector silently un-checking its own declaration, a
// comment folding into the following rule's selector, a plural `States=` axis
// read as `State=`). A second copy would not inherit the next one.
//
// Same conservatism as the colour path, for the same reason: a false
// unverifiable understates coverage honestly, a false mismatch produces a bug
// list nobody trusts, and a distrusted gate gets widened.

var fs = require("node:fs");
var path = require("node:path");
var C = require("./fidelity-classify.js");

// Shape properties the capture can speak to. `width` is deliberately ABSENT:
// see resolveSizeFact below for why a captured width is not a component fact.
var GEOMETRY_PROPS = [
  "gap",
  "row-gap",
  "column-gap",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "height",
  "min-height",
];

var SIDES = ["top", "right", "bottom", "left"];

// A length, resolved to px, plus the token it was bound through when it was
// bound through one. `var(--a, var(--b))` resolves through the chain; a value
// that is not a plain length (calc, %, auto, fit-content) resolves to null and
// its declaration becomes unverifiable rather than being guessed at.
function lengthOf(value, tokenMap, depth) {
  var v = String(value == null ? "" : value).trim();
  if (!v) return null;
  var m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,([\s\S]*))?\)$/i.exec(v);
  if (m) {
    if ((depth || 0) > 8) return null;
    var token = m[1];
    var next =
      tokenMap[token] != null ? tokenMap[token] : m[2] == null ? null : m[2];
    if (next == null) return null;
    var inner = lengthOf(next, tokenMap, (depth || 0) + 1);
    if (!inner) return null;
    // The OUTERMOST token is the binding this declaration made. An inner one
    // is the token map's own business.
    return { px: inner.px, token: token };
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return { px: parseFloat(v), token: null };
  if (/^-?\d+(\.\d+)?px$/i.test(v)) return { px: parseFloat(v), token: null };
  return null;
}

// The same, for a captured value. The capture writes plain px strings.
function capturedLength(value) {
  if (value == null) return null;
  var v = String(value).trim();
  if (/^-?\d+(\.\d+)?(px)?$/i.test(v)) return parseFloat(v);
  return null;
}

// Which captured fact a CSS property asks about, given the axis the capture
// recorded for the node.
//
// Figma stores ONE spacing number per auto-layout frame, along its main axis.
// CSS `gap` sets both axes, and the longhand that lines up with Figma's number
// depends on the axis: `column-gap` on a row, `row-gap` on a column. The other
// longhand asks about a distance Figma never recorded, so it is reported as
// such instead of being compared against the number for the other axis.
function kindOf(prop, axis) {
  if (prop === "gap") return "gap";
  if (prop === "column-gap") return axis === "column" ? null : "gap";
  if (prop === "row-gap") return axis === "column" ? "gap" : null;
  if (prop === "padding") return "padding";
  if (prop.indexOf("padding-") === 0) return prop;
  if (prop === "height" || prop === "min-height") return "height";
  return null;
}

// Expand a padding shorthand into its four sides. Returns null when any part is
// not a plain length, so `padding: 0 auto` is unverifiable rather than
// half-compared.
//
// Split on whitespace OUTSIDE parentheses: `padding: 0 var(--zen-spacing-sm)`
// is two parts, and a naive split on /\s+/ tears a wrapped var() in half.
function expandPadding(value, tokenMap) {
  var parts = String(value)
    .trim()
    .split(/\s+(?![^(]*\))/)
    .filter(Boolean);
  var lens = parts.map(function (p) {
    return lengthOf(p, tokenMap, 0);
  });
  if (!lens.length || lens.length > 4) return null;
  if (
    lens.some(function (l) {
      return !l;
    })
  )
    return null;
  var a = lens[0],
    b = lens[1],
    c = lens[2],
    d = lens[3];
  if (lens.length === 1) return { top: a, right: a, bottom: a, left: a };
  if (lens.length === 2) return { top: a, right: b, bottom: a, left: b };
  if (lens.length === 3) return { top: a, right: b, bottom: c, left: b };
  return { top: a, right: b, bottom: c, left: d };
}

// The captured geometry of one node, or of one `layout.variants` entry, which
// carries the same field names.
function geometryOf(layout) {
  var l = layout || {};
  return {
    axis: l.axis || null,
    gap: capturedLength(l.gap),
    gapToken: l.gapToken || null,
    padding: l.padding || null,
    paddingTokens: l.paddingTokens || null,
    sizing: l.sizing || null,
    size: l.size || null,
  };
}

// The captured height, and only when the capture says the height is FIXED.
//
// Width is not read at all, and that is a decision rather than an omission. A
// captured root width is the width of the instance where it sits on the Figma
// canvas, not a property of the component: global-header captures at 1920px,
// alert-banner at 562px, and button's `State=Loading` variant at 132px because
// that one instance happened to hold a longer label. Height on a fixed-height
// component is a component fact (button 32, tabs 40). Comparing width would
// produce a long list of disagreements that are all canvas placement, which is
// exactly the kind of untrustworthy output that gets a gate widened.
// `isVariant` relaxes the fixed-height requirement, and only there. A
// `layout.variants` entry records ONLY what differs from the base, so an entry
// carrying `size: {h: "24px"}` is stating that this variant's height is 24px,
// whether or not it also restates the `sizing` flags (27 of the 40 entries omit
// them; 6 of those still state a height). On a ROOT the requirement stays,
// because 109 of the 180 captured roots carry no `sizing` at all and a height
// read off one of those would be the height of whatever instance was on the
// canvas.
function heightFact(g, isVariant) {
  if (!g.size || g.size.h == null) return null;
  if (g.sizing ? g.sizing.v !== "fixed" : !isVariant) return null;
  return capturedLength(g.size.h);
}

function factOf(g, kind, isVariant) {
  if (kind === "gap") return g.gap;
  if (kind === "height") return heightFact(g, isVariant);
  if (kind.indexOf("padding-") === 0) {
    if (!g.padding) return null;
    return capturedLength(g.padding[kind.slice("padding-".length)]);
  }
  return null;
}

function factTokenOf(g, kind) {
  if (kind === "gap") return g.gapToken;
  if (kind.indexOf("padding-") === 0) {
    if (!g.paddingTokens) return null;
    return g.paddingTokens[kind.slice("padding-".length)] || null;
  }
  return null;
}

/** The capture's root layout and its per-variant layout entries. */
function readLayout(slug, anatomyDir) {
  var a = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, slug + ".json"), "utf8"),
  );
  var root = a.root || a;
  return {
    rootName: root.name || null,
    root: geometryOf(root.layout),
    variants: ((root.layout || {}).variants || []).map(function (v) {
      return { values: v.values || [], geometry: geometryOf(v) };
    }),
  };
}

// Classify every geometry declaration in one slug's owned rules into exactly
// one of verified / verifiedViaTokenName / mismatch / unverifiable /
// overridden. Mirrors classifySlug's contract so both reports read the same and
// a caller can total them the same way.
function classifySlugGeometry(opts) {
  var slug = opts.slug;
  var prefixes = opts.prefixes;
  var layout = opts.layout;
  var tokenMap = opts.tokenMap || {};
  var sharedPrefixes = opts.sharedPrefixes || {};

  var result = {
    slug: slug,
    prefixes: prefixes.slice(),
    verified: 0,
    verifiedViaTokenName: 0,
    mismatch: 0,
    unverifiable: 0,
    overridden: 0,
    mismatches: [],
    tokenNameAgreements: [],
    reasons: {},
  };
  function unverifiable(reason) {
    result.unverifiable++;
    result.reasons[reason] = (result.reasons[reason] || 0) + 1;
  }

  var rootGeom = layout ? layout.root : null;
  var rootIsStateInstance = C.rootIsNonDefaultState(layout && layout.rootName);

  // Pass 1: collect every comparable geometry fact each owned rule states, in
  // source order. A padding shorthand contributes one candidate PER SIDE: the
  // capture holds four numbers there, and counting the shorthand as one row
  // would make the measure depend on whether the author wrote `padding` or four
  // longhands.
  var candidates = [];
  C.ownedRules(opts.css, prefixes).forEach(function (rule) {
    var shared = (sharedPrefixes[rule.prefix] || []).length > 1;
    var cls = C.classifySelector(rule.selector, rule.prefix);
    var axis = rootGeom ? rootGeom.axis : null;

    rule.body.split(";").forEach(function (decl) {
      var idx = decl.indexOf(":");
      if (idx < 0) return;
      var prop = decl.slice(0, idx).trim().toLowerCase();
      if (GEOMETRY_PROPS.indexOf(prop) === -1) return;
      var raw = decl.slice(idx + 1).trim();

      if (prop === "padding") {
        var sides = expandPadding(raw, tokenMap);
        if (!sides) {
          candidates.push({
            index: candidates.length,
            rule: rule,
            shared: shared,
            cls: cls,
            prop: prop,
            kind: "padding",
            length: null,
          });
          return;
        }
        SIDES.forEach(function (side) {
          candidates.push({
            index: candidates.length,
            rule: rule,
            shared: shared,
            cls: cls,
            prop: "padding-" + side,
            kind: "padding-" + side,
            length: sides[side],
          });
        });
        return;
      }

      var kind = kindOf(prop, axis);
      if (kind === null) {
        // A gap longhand on the axis Figma never measured. Recorded so its size
        // is visible rather than silently dropped from the denominator.
        if (prop === "row-gap" || prop === "column-gap")
          candidates.push({
            index: candidates.length,
            rule: rule,
            shared: shared,
            cls: cls,
            prop: prop,
            kind: null,
            length: null,
          });
        return;
      }
      candidates.push({
        index: candidates.length,
        rule: rule,
        shared: shared,
        cls: cls,
        prop: prop,
        kind: kind,
        length: lengthOf(raw, tokenMap, 0),
      });
    });
  });

  // Pass 2: resolve the cascade, exactly as the colour path does. Two rules can
  // set the same property on the same subject and only the winner paints;
  // charging a slug for a declaration its own later rule overrode reports a
  // defect the render never draws. Keyed on prefix+bucket+modifier+KIND rather
  // than the property name, because `padding` and `padding-left` are two
  // spellings of one subject and the shorthand really is overridden by the
  // longhand after it.
  function subjectKey(c) {
    var mod = c.cls.modifier || "";
    var prefixPart = mod ? "" : c.rule.prefix + "|";
    return prefixPart + c.cls.bucket + "|" + mod + "|" + (c.kind || c.prop);
  }
  var winners = {};
  candidates.forEach(function (c) {
    if (c.cls.bucket !== "root" && c.cls.bucket !== "modifier") return;
    var key = subjectKey(c);
    var spec = C.classCount(c.rule.selector);
    var prev = winners[key];
    if (!prev || spec >= prev.spec) winners[key] = { index: c.index, spec: spec };
  });

  // Pass 3: classify what actually paints.
  candidates.forEach(function (c) {
    if (c.cls.bucket === "root" || c.cls.bucket === "modifier") {
      if (winners[subjectKey(c)].index !== c.index) {
        result.overridden++;
        return;
      }
    }

    if (!rootGeom) return unverifiable("no-capture");
    if (c.cls.bucket === "state") return unverifiable("state-unreachable");
    if (c.cls.bucket === "element")
      return unverifiable("element-no-node-mapping");
    if (c.cls.bucket === "other")
      return unverifiable("selector-not-attributable");
    if (c.kind === null) return unverifiable("gap-cross-axis-not-captured");
    if (!c.length) return unverifiable("value-not-a-plain-length");

    var target = null;
    if (c.cls.bucket === "modifier") {
      var wanted = c.cls.modifier.toLowerCase();
      var hit = layout.variants.find(function (v) {
        return v.values.some(function (val) {
          return String(val).toLowerCase().replace(/\s+/g, "-") === wanted;
        });
      });
      if (!hit) return unverifiable("no-matching-variant");
      target = hit.geometry;
    } else {
      if (c.shared) return unverifiable("shared-base-no-single-subject");
      if (rootIsStateInstance) return unverifiable("root-is-non-default-state");
      target = rootGeom;
    }

    var isVariant = c.cls.bucket === "modifier";
    var fact = factOf(target, c.kind, isVariant);
    // A variant entry records only what DIFFERS from the base, so a modifier
    // rule stating a value the variant does not restate is compared against the
    // base's own fact rather than reported as uncapturable.
    if (fact == null && isVariant) fact = factOf(rootGeom, c.kind, false);
    if (fact == null) return unverifiable("no-fact-of-kind");

    var factToken =
      factTokenOf(target, c.kind) ||
      (c.cls.bucket === "modifier" ? factTokenOf(rootGeom, c.kind) : null);
    var tokenAgrees = !!(
      c.length.token &&
      factToken &&
      String(factToken).toLowerCase() === String(c.length.token).toLowerCase()
    );
    // Half a pixel, because Figma reports fractional sizes and the capture
    // rounds them to two places.
    var agrees = Math.abs(c.length.px - fact) <= 0.5;

    if (agrees) {
      result.verified++;
    } else if (tokenAgrees) {
      // Our binding names the token the capture names, and the two resolve to
      // different numbers. That is the spacing scale disagreeing with itself,
      // not this component's CSS getting the shape wrong, so it is not a
      // mismatch. Counted separately so the size of that class is visible
      // rather than folded into a plain match.
      result.verifiedViaTokenName++;
      result.tokenNameAgreements.push({
        slug: slug,
        selector: c.rule.selector,
        property: c.prop,
        token: c.length.token,
        ourValue: c.length.px,
        capturedValue: fact,
        message:
          slug +
          " " +
          c.rule.selector +
          " {" +
          c.prop +
          "}: binds " +
          c.length.token +
          ", which the capture also names, but the two resolve differently " +
          "(ours " +
          c.length.px +
          "px, capture says " +
          fact +
          "px). The binding agrees; the divergence points at the token " +
          "snapshot, not the CSS.",
      });
    } else {
      result.mismatch++;
      result.mismatches.push({
        slug: slug,
        selector: c.rule.selector,
        property: c.prop,
        token: c.length.token,
        painted: c.length.px,
        fact: fact,
        // The token the CAPTURE names for this fact, when it names one. Carried
        // so a repair can bind the token Figma bound rather than restating its
        // number, which is what `feedback_tokens` asks for and what keeps the
        // declaration re-themeable. Null on the 108-of-415 that Figma left
        // unbound.
        factToken: factToken || null,
        message:
          slug +
          " " +
          c.rule.selector +
          " {" +
          c.prop +
          "}: states " +
          (c.length.token ? c.length.token + "=" : "") +
          c.length.px +
          "px but the capture measured " +
          fact +
          "px",
      });
    }
  });

  return result;
}

module.exports = {
  GEOMETRY_PROPS: GEOMETRY_PROPS,
  SIDES: SIDES,
  lengthOf: lengthOf,
  capturedLength: capturedLength,
  kindOf: kindOf,
  expandPadding: expandPadding,
  geometryOf: geometryOf,
  heightFact: heightFact,
  factOf: factOf,
  factTokenOf: factTokenOf,
  readLayout: readLayout,
  classifySlugGeometry: classifySlugGeometry,
};
