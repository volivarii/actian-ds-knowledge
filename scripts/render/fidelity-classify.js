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
//
// This reads the FIRST alternative only, which is exactly right for its one
// caller, classifyAlternative below: that caller has already split a
// possibly-grouped selector and hands this function one alternative at a
// time, so "first" and "only" are the same thing there. It is exported and
// any future caller passing a still-grouped, multi-alternative selector
// would get only that selector's first alternative back, not a per-group
// answer -- classifySelector below is the place that handles a group.
function rightmost(selector) {
  var first = String(selector).split(",")[0].trim();
  var parts = first.split(/\s*>\s*|\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : first;
}

// Bucket ONE comma-free alternative by what it targets, relative to the
// prefix that owns it. The body below is exactly what classifySelector used
// to do directly on the whole (possibly grouped) selector; factored out so
// classifySelector can run it per alternative instead.
function classifyAlternative(alt, prefix) {
  if (STATE_RE.test(alt)) return { bucket: "state" };
  var target = rightmost(alt);
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

// Bucket a rule by what it targets, relative to the prefix that owns it.
//
// Final-review finding 1: this used to test STATE_RE against the WHOLE
// comma-separated selector, while `rightmost` (and so the rest of this
// function) read only the FIRST alternative. Grouping a genuinely
// comparable selector with an unrelated alternative -- a trailing
// `:hover`, a leading BEM-element sibling -- then flipped the WHOLE rule's
// bucket to state/element and its wrong color silently stopped being
// checked at all: `.ds-segmented { background: var(--zen-bad); }` reports a
// mismatch, but `.ds-segmented, .ds-segmented:hover { background:
// var(--zen-bad); }` used to report nothing wrong. A future engineer could
// turn a red build green by refactoring a selector into a group with no
// change to the color itself. Fixed by classifying every alternative on its
// own (classifyAlternative above) and combining:
//
// - A single alternative keeps its own classification, unchanged.
// - If exactly ONE distinct comparable subject (root, or one specific
//   modifier value) appears among the alternatives, that IS what this
//   declaration paints, regardless of what its sibling alternatives are: an
//   extra `:hover` or unrelated element alternative only ADDS reach, it does
//   not revoke the plain alternative's reach.
// - If TWO OR MORE distinct comparable subjects appear (two different
//   modifiers, two different prefixes' roots), there is no way to pick one
//   without guessing which the capture should be compared against, so the
//   whole group is unattributable ("other" -> selector-not-attributable).
//   This is the conservative direction the rest of this file always takes:
//   never invent a subject, never produce a false mismatch.
// - If NO alternative is comparable and every alternative agrees on the same
//   bucket (all state, or all element), that bucket is kept -- the real
//   corpus's own grouped rules are exactly this shape
//   (`.ds-lineage-node__source, .ds-lineage-node__key` is element+element;
//   `.ds-calendar__day.is-selected, .ds-calendar__day.is-range-start, ...`
//   is state+state+state) -- so their specific `reasons` entry
//   (element-no-node-mapping / state-unreachable) is preserved rather than
//   collapsing into the generic "other" just because the rule has more than
//   one alternative. A genuine mix of non-comparable buckets is "other".
function classifySelector(selector, prefix) {
  var alts = String(selector)
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  if (alts.length === 0) return { bucket: "other" };
  var classified = alts.map(function (alt) {
    return classifyAlternative(alt, prefix);
  });
  if (classified.length === 1) return classified[0];

  var comparable = {};
  classified.forEach(function (c) {
    if (c.bucket === "root" || c.bucket === "modifier") {
      comparable[c.bucket + "|" + (c.modifier || "")] = c;
    }
  });
  var comparableKeys = Object.keys(comparable);
  if (comparableKeys.length === 1) return comparable[comparableKeys[0]];
  if (comparableKeys.length > 1) return { bucket: "other" };

  var firstBucket = classified[0].bucket;
  var allSame = classified.every(function (c) {
    return c.bucket === firstBucket;
  });
  return allSame ? classified[0] : { bucket: "other" };
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

// The Figma VARIABLE NAME the capture recorded beside the resolved hex, when
// it recorded one. The anatomy captures carry backgroundToken /
// border.colorToken / text.colorToken alongside every resolved color, so for
// many declarations Figma literally names the variable it painted with.
function factTokenOf(node, kind) {
  var a = node || {};
  if (kind === "background") return a.backgroundToken || null;
  if (kind === "border") return (a.border && a.border.colorToken) || null;
  if (kind === "text") return (a.text && a.text.colorToken) || null;
  return null;
}

// A capture root's NAME encodes the Figma variant the capture was taken from
// ("State=Hovered, Type=Default" for avatar). A State axis whose value is not
// "Default" means the capture is of an INTERACTION state, so an unmodified
// base rule has no comparable subject: comparing `.ds-avatar` against a HOVER
// capture reports a defect that does not exist.
//
// Only a State axis suppresses, and only when its value is not "Default".
// Every other axis in a root name is an identity axis whose captured instance
// is Figma's own default (`lineage-grouped-node` is "State=Default, Type=Main
// item", `segmented-control` is "Type=Default", `button` is "Intent=Default,
// Emphasis=Filled, Size=Default, State=Default"), and those roots stay
// comparable. The `(?:^|,)` anchor and the `=` immediately after `State` keep
// this from firing on a different axis that merely starts with the same
// letters: `input-date`'s "States=Enabled" is a plural axis name, not State.
var ROOT_STATE_RE = /(?:^|,)\s*State\s*=\s*([^,]+)/i;
function rootIsNonDefaultState(name) {
  var m = ROOT_STATE_RE.exec(String(name || ""));
  if (!m) return false;
  return m[1].trim().toLowerCase() !== "default";
}

// How many class tokens a selector's first alternative carries. Every selector
// that reaches the override resolution below is class-only (pseudo-class and
// attribute selectors are bucketed as `state` long before), so this is that
// selector's CSS specificity for ordering purposes, and nothing more general
// is needed or claimed.
function classCount(selector) {
  return (
    String(selector)
      .split(",")[0]
      .match(/\.[a-z0-9_-]+/gi) || []
  ).length;
}

// Every rule in `css` whose selector matches one of `prefixes`, tagged with
// the prefix that claimed it. Same selector regex consumedVars uses, so a
// single trailing hyphen is rejected and `.ds-loader` does not absorb
// `.ds-loader-with-logo`.
//
// Strips comments itself rather than trusting the caller to have done so.
// A comment sits between two rules' braces, so the brace regex below folds
// it into the FOLLOWING rule's captured selector text; a comment mentioning
// another component's class (e.g. ".ds-search-result-card"'s own preceding
// comment says it reuses ".ds-tag" rules verbatim) then makes that class
// name match the prefix loop before the rule's real selector ever runs,
// silently attributing the rule to the wrong owner. This function is
// exported for future callers, so it must be correct on raw CSS, not merely
// on whatever classifySlug happens to pre-strip.
function ownedRules(css, prefixes) {
  var stripped = stripComments(css);
  var out = [];
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  while ((m = re.exec(stripped)) !== null) {
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
    // Review finding 2: a declaration where our binding names the SAME token
    // the capture names, but the two sides' resolved hexes differ, is
    // correct (the binding is right) yet was previously folded into plain
    // `verified` with no way to tell it apart from a direct hex match. Kept
    // as its own bucket, counted toward the checkable/examined totals same
    // as `verified`, but never toward `mismatch` -- it does not block the
    // build. See tokenNameAgreements below for the per-occurrence detail.
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

  var rootEntry =
    facts && facts.byNode && facts.byNode.length ? facts.byNode[0] : null;
  var rootNode = rootEntry ? rootEntry.appearance : null;
  var variants = (rootNode && rootNode.variants) || [];
  var rootIsVariantInstance = variants.length > 0;
  var rootIsStateInstance = rootIsNonDefaultState(rootEntry && rootEntry.name);

  // Pass 1: every color declaration the slug's owned rules carry, in source
  // order, with the bucket its selector falls into. Collected before anything
  // is classified so the cascade can be resolved across rules (pass 2).
  // ownedRules strips comments itself now, so no need to pre-strip here too.
  var candidates = [];
  ownedRules(opts.css, prefixes).forEach(function (rule) {
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
      candidates.push({
        index: candidates.length,
        rule: rule,
        shared: shared,
        cls: cls,
        prop: prop,
        color: color,
        kind: kind,
      });
    });
  });

  // Pass 2: resolve the cascade. Two rules can set the SAME property on the
  // same subject, and then only one of them is what the browser paints: the
  // more specific selector wins, source order breaks a tie. tag-stage is the
  // case that needs this. It shares the `.ds-tag--<color>` scale with
  // tag-default, but Figma gives the two components different Orange and
  // Yellow borders, so tag-stage carries its own `.ds-tag-stage--<color>`
  // rules AFTER the shared ones. Charging tag-stage for a shared declaration
  // its own rule overrides would report a defect the render never paints.
  //
  // The key is the exact PROPERTY, not the fact kind it maps to. Keying on the
  // kind collapsed `.ds-notification { border: ...; border-left-color: ... }`,
  // where both declarations really do paint (the shorthand paints three sides
  // the longhand never touches) and neither overrides the other. Keying on the
  // property can miss a real override written across two different property
  // names (`border` then `border-color`); none exists in this corpus, and
  // missing one costs at most a false mismatch the gate then reports, whereas
  // a wrong collapse silently deletes a declaration from the measurement.
  //
  // Only root and modifier buckets have a subject well-defined enough to key
  // on; element/state/other are unverifiable regardless of which one wins, so
  // they are left alone. Losers count as `overridden` and are excluded from
  // every other bucket: an overridden declaration is not paint at all, so
  // calling it unverifiable would inflate "the capture cannot speak to this"
  // with declarations the capture has no reason to speak to.
  // Review finding 1: a root-bucket rule carries no modifier value, so
  // bucket+modifier+prop alone gave every root rule the same key regardless
  // of which prefix it came from -- "root||background" for BOTH `.ds-alpha`
  // and `.ds-beta`, even though a bare `.prefix` selector's identity IS its
  // prefix and nothing else names which element it targets. Two different
  // prefixes' root rules must never collapse into one subject on that basis
  // alone: prefix is included here so they never do (proven by the
  // ds-alpha/ds-beta synthetic case in fidelity-classify.test.js).
  //
  // A modifier-bucket rule keeps the prior modifier-only key, prefix
  // excluded. The modifier VALUE itself (e.g. "orange") is a semantic axis
  // value, and this repo's one multi-prefix slug (tag-stage, CSS_OWNERS:
  // ["ds-tag", "ds-tag-stage"]) uses restating that SAME value under its own
  // prefix as the deliberate mechanism for overriding a shared family color
  // for itself alone: its fragment renders `.ds-tag--orange` and
  // `.ds-tag-stage--orange` on the literal same element. Keying modifier by
  // prefix too would split that override into two independently classified
  // declarations and reintroduce the two real mismatches the tag-stage
  // remedy (task 6) resolved -- confirmed by trial: doing so against the
  // real corpus turns tag-stage's `mismatch 0, overridden 2` into
  // `mismatch 2, overridden 0`.
  //
  // Final-review finding 2, the failure mode this trade-off carries: prefix
  // is excluded from the modifier key precisely BECAUSE tag-stage's two
  // rules sit on the same element, so this is correct only as long as that
  // precondition holds. Stated explicitly: for any slug owning more than one
  // prefix, two modifier rules that restate the SAME modifier value under
  // two different prefixes always collapse into one subject key here,
  // whether or not the two classes actually land on the same element. If
  // they were ever NOT on the same element, the loser would still resolve to
  // `overridden` (and so drop out of every other bucket) and the winner
  // would still read `verified`, even if the winner's color is wrong -- a
  // false `verified`, not merely a lost row, and the worst outcome this gate
  // exists to prevent. tests/render/css-owners.test.js pins the precondition
  // (every such pair of classes must appear in the same `class="..."`
  // attribute of the owning slug's fragment) so a future renderer change
  // that separates them reds the build instead of silently producing a false
  // verified.
  function subjectKey(c) {
    var mod = c.cls.modifier || "";
    var prefixPart = mod ? "" : c.rule.prefix + "|";
    return prefixPart + c.cls.bucket + "|" + mod + "|" + c.prop;
  }
  var winners = {};
  candidates.forEach(function (c) {
    if (c.cls.bucket !== "root" && c.cls.bucket !== "modifier") return;
    var key = subjectKey(c);
    var spec = classCount(c.rule.selector);
    var prev = winners[key];
    if (!prev || spec >= prev.spec)
      winners[key] = { index: c.index, spec: spec };
  });

  // Pass 3: classify the declarations that actually paint.
  candidates.forEach(function (c) {
    var rule = c.rule;
    var cls = c.cls;
    var prop = c.prop;
    var color = c.color;
    var kind = c.kind;

    if (cls.bucket === "root" || cls.bucket === "modifier") {
      if (winners[subjectKey(c)].index !== c.index) {
        result.overridden++;
        return;
      }
    }

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
      if (c.shared) return unverifiable("shared-base-no-single-subject");
      if (rootIsVariantInstance)
        return unverifiable("root-is-variant-instance");
      // The capture is of an interaction state, not the neutral default, so a
      // base rule has no comparable subject. Same conservatism as the variant
      // instance above; separate reason so the report says WHICH kind of
      // non-neutral root it was.
      if (rootIsStateInstance) return unverifiable("root-is-non-default-state");
      target = rootNode;
    }

    var fact = factOf(target, kind);
    if (!fact) return unverifiable("no-fact-of-kind");

    // Token-name agreement. When the capture names the variable it painted
    // with AND our declaration binds THAT SAME variable, both sides agree on
    // the semantic binding and the declaration is correct. A hex difference
    // under an identical token name is a theme-mode artifact (tokens.css
    // defines each token up to three times, under :root/[data-theme="actian"],
    // [data-theme="studio"] and [data-theme="explorer"], and the capture
    // resolves whichever mode the captured node sits in) or a snapshot-vintage
    // artifact, never a CSS defect. global-header's root is literally
    // "App type=Studio", and its captured --zen-border-default is the Studio
    // value of a token our CSS binds by name.
    //
    // DELIBERATELY NARROW: token names are read only here, as a positive
    // signal at the point of comparison. They are NOT used to reclassify the
    // unverifiable population (a captured token name on a node we cannot
    // attribute is still a declaration we cannot check). That larger upgrade
    // is a separate piece of work.
    var factToken = factTokenOf(target, kind);
    var tokenAgrees = !!(
      color.token &&
      factToken &&
      String(factToken).toLowerCase() === String(color.token).toLowerCase()
    );
    var hexAgrees =
      String(fact).toLowerCase() === String(color.resolved).toLowerCase();

    if (hexAgrees) {
      result.verified++;
    } else if (tokenAgrees) {
      // Review finding 2: the binding names the same token the capture
      // names, but the resolved hexes differ. That divergence is exactly
      // what a stale tokens/tokens.css snapshot or a live theme-mode
      // difference looks like, never a CSS defect (the binding itself
      // agrees), so this is not a mismatch. It was previously silently
      // indistinguishable from a direct hex-match `verified` -- counted here
      // instead, so the size of this class is visible rather than rounded
      // away into the same bucket as a plain match.
      result.verifiedViaTokenName++;
      result.tokenNameAgreements.push({
        slug: slug,
        selector: rule.selector,
        property: prop,
        token: color.token,
        ourValue: color.resolved,
        capturedValue: fact,
        message:
          slug +
          " " +
          rule.selector +
          " {" +
          prop +
          "}: binds " +
          color.token +
          ", which the capture also names, but the resolved hexes differ " +
          "(ours " +
          color.resolved +
          ", capture says " +
          fact +
          "). The binding agrees; the divergence points at the token " +
          "snapshot (tokens/tokens.css), not the CSS.",
      });
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
  factTokenOf: factTokenOf,
  rootIsNonDefaultState: rootIsNonDefaultState,
  classCount: classCount,
  COLOR_PROPS: COLOR_PROPS,
  SHORTHAND_PROPS: SHORTHAND_PROPS,
  STATE_RE: STATE_RE,
};
