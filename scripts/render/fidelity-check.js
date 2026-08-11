"use strict";
var readAppearance = require("./derive-appearance.js").readAppearance;

// Collect the resolved color values a slug's facts legitimately carry.
function factColors(facts) {
  var set = new Set();
  facts.variants.forEach(function (v) {
    if (v.background) set.add(String(v.background).toLowerCase());
    if (v.border && v.border.color)
      set.add(String(v.border.color).toLowerCase());
  });
  facts.byNode.forEach(function (n) {
    var a = n.appearance || {};
    if (a.background) set.add(String(a.background).toLowerCase());
    if (a.border && a.border.color)
      set.add(String(a.border.color).toLowerCase());
    // Text color is as legitimate a captured fact as background/border --
    // gray-box-to-zero family 2 (tag-catalog) is the first ds-base.css rule
    // to bind a text color, so this was never exercised before. Without it,
    // a genuinely correct var(--zen-color-text-default) reads as a
    // violation just because factColors() never looked at .text.color.
    if (a.text && a.text.color) set.add(String(a.text.color).toLowerCase());
  });
  return set;
}

// Extract the CSS block appended for a derived slug from the shared sheet.
function slugCss(css, slug) {
  var re = new RegExp(
    "/\\* " +
      slug.replace(/[-]/g, "\\-") +
      " \\(derived-from-facts\\) \\*/([\\s\\S]*?)(?=/\\* [a-z-]+ \\(derived-from-facts\\)|$)",
  );
  var m = re.exec(css);
  return m ? m[1] : "";
}

// The shared per-rule fact-color invariant: every hex literal a rule emits
// must match a resolved appearance fact color, and every var(--zen-token) it
// emits must be defined AND round-trip to a fact color. `label` prefixes each
// violation message (a slug for the derived-appendix caller, a scope name
// like "ds-base.css" for the base-css caller) so violations stay attributable
// to their source regardless of which caller found them.
function checkRuleBody(label, selector, body, factSet, tokenMap, violations) {
  // Strip CSS comments before scanning. The grouped tag-status family (Fix
  // B, gray-box-to-zero family 2 review pass) puts its value-first
  // explanatory comments INSIDE the rule body (right after `{`), unlike the
  // single-word .ds-tag--<x> rules above them whose comments sit above the
  // selector -- so those comments' own hex mentions (e.g. "resolves to
  // #f8f4f3 in tokens.css", documenting the token that does NOT round-trip)
  // would otherwise be scanned as if they were emitted declarations and
  // flagged as a false violation, even though the real background/
  // border-color declarations round-trip cleanly.
  body = body.replace(/\/\*[\s\S]*?\*\//g, "");
  // hex literals emitted must be a fact value
  (body.match(/#[0-9a-fA-F]{3,8}/g) || []).forEach(function (hex) {
    if (!factSet.has(hex.toLowerCase()))
      violations.push(
        label +
          " " +
          selector +
          ": emitted color " +
          hex +
          " matches no appearance fact",
      );
  });
  // Tokens emitted must be defined + round-trip to a fact value.
  // Whitespace-tolerant on purpose: Prettier wraps a long declaration as
  //   background: var(
  //     --zen-color-success-50
  //   );
  // and the original `var\((--zen-[a-z0-9-]+)\)` required the name to sit
  // flush against both parens, so every wrapped reference was silently
  // skipped -- the gate read a rule it could not check as a clean rule. Found
  // when a deliberately wrong stage colour passed. Match the name, not the
  // formatting.
  var VAR_REF = /var\(\s*(--zen-[a-z0-9-]+)\s*\)/g;
  var vm;
  var refs = [];
  while ((vm = VAR_REF.exec(body)) !== null) refs.push(vm[1]);
  refs.forEach(function (tok) {
    if (!tokenMap[tok])
      violations.push(
        label + " " + selector + ": token " + tok + " is undefined",
      );
    else if (!factSet.has(tokenMap[tok].toLowerCase()))
      violations.push(
        label +
          " " +
          selector +
          ": token " +
          tok +
          "=" +
          tokenMap[tok] +
          " does not round-trip to a fact",
      );
  });
}

// Scope: this gate validates the colors in the derived-from-facts CSS
// appendix only. Inline colors in the fragment markup are out of scope.
//
// Current state: TEMPLATES (templates/index.js) is empty as of phase 1b-beta,
// so no render carries source:"derived" and the loop below examines zero
// renders on every call. That is expected, not a bug: the loop is inert
// until a slug is templated again, at which point it starts actually
// checking that render's derived-from-facts CSS against its facts. See
// tests/render/fidelity-check.test.js for the test that pins this
// precondition and the sibling test that proves the loop body itself works.
function fidelityCheck(canonical, ctx) {
  var violations = [];
  var tokenMap = ctx.tokenMap || {};
  (canonical.manifest.renders || []).forEach(function (r) {
    if (r.source !== "derived") return;
    var facts = readAppearance(r.slug, ctx.anatomyDir);
    var ok = factColors(facts);
    var block = slugCss(canonical.css, r.slug);
    // A derived render whose block is empty (or missing entirely) is a render
    // the gate cannot verify ANYTHING about -- that must red, not pass
    // silently, or a stripped/never-generated appendix would ship unnoticed.
    if (!block || !block.trim()) {
      violations.push(
        r.slug +
          ': marked source:"derived" but has no derived-from-facts CSS block to verify (the fidelity gate cannot check it)',
      );
      return;
    }
    // Walk rule-by-rule (not the whole block at once) so a violation can name
    // the selector it came from (e.g. ".ds-tag--pink") -- the appearance facts
    // carry only resolved color values, never variant names, so the selector
    // text is the only place a human-legible name (e.g. "pink") can come from.
    var ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    var m;
    while ((m = ruleRe.exec(block)) !== null) {
      var selector = m[1].trim();
      checkRuleBody(r.slug, selector, m[2], ok, tokenMap, violations);
    }
  });
  return violations;
}

// Per-owner lookup, NOT a union, for a (possibly hyphenated) .ds-tag--<x>
// modifier. Gray-box-to-zero family 2 added standalone .ds-tag--<x> rules
// for OTHER dedicated tag-family members (e.g. tag-catalog, tag-shared,
// tag-status) that carry their OWN captured facts, distinct from
// tag-default's Color axis. An earlier version unioned every "tag*" fact set
// the caller provided into one palette before checking any rule against it
// -- that let a FABRICATED modifier (e.g. an invented .ds-tag--bogus) pass
// by borrowing a sibling member's captured color (tag-catalog's legitimate
// #000000 text color is not evidence that some unrelated modifier's color is
// legitimate too). Union membership carries no provenance, so that check was
// gate-weakening. Compound modifiers (e.g. "status-error", from the grouped
// tag-status family) resolve by longest-registered-prefix: try
// facts["tag-status-error"], then facts["tag-status"], stripping one
// trailing hyphen-segment at a time, before falling back to
// facts["tag-default"] -- whose Color axis owns the plain color modifiers
// (.ds-tag--indigo, .ds-tag--gray, ...) and is also the fallback for any
// modifier with no registered owner at any prefix depth (e.g. a fabricated
// .ds-tag--bogus).
function resolveTagOwner(modifier, facts) {
  var segments = modifier.split("-");
  for (var i = segments.length; i > 0; i--) {
    var key = "tag-" + segments.slice(0, i).join("-");
    if (facts[key]) return facts[key];
  }
  return facts["tag-default"] || { variants: [], byNode: [] };
}

// Slice 2 folded the tag color variants + the checkbox indeterminate rule
// into the shared ds-base.css asset (renderer relocation phase 1b-alpha),
// outside the derived-from-facts appendix `fidelityCheck` scans above. This
// verifies THOSE rules against the same fact-color invariant, extracted by
// selector (robust to ds-base.css's comment headers moving or changing).
// `cssText` is ds-base.css's content and `facts` maps a fact-source name
// (e.g. "tag-default", "checkbox") to its readAppearance() result, so the
// caller controls which anatomy facts each selector group is checked
// against. The modifier char class includes `-` so compound modifiers (the
// grouped tag-status family: status-error/-info/-neutral/-success/-warning)
// are captured and checked, not silently skipped -- see resolveTagOwner
// above for how a compound modifier finds its owning fact source.
function checkBaseCssRules(cssText, facts, tokenMap) {
  var violations = [];
  // Capture the WHOLE selector, not just the modifier. A hue modifier can be
  // scoped to one family member (`.ds-tag-stage.ds-tag--lime`), and after the
  // 2026-07-23 redesign tag-stage's Lime and Orange fills no longer match
  // tag-default's, so the same modifier legitimately carries two different
  // values depending on which component the rule is scoped to. Resolving the
  // owner from the modifier alone would check a stage rule against
  // tag-default's capture and flag a correct colour.
  var re = /([^{}]*?)\.ds-tag--([a-z0-9-]+)\s*\{([^}]*)\}/g;
  var m;
  while ((m = re.exec(cssText)) !== null) {
    // Strip comments and keep only the trailing selector fragment: [^{}]*?
    // cannot cross a brace, so m[1] starts right after the previous rule's },
    // which means it also sweeps up any comment block between the two rules.
    // Left raw, a violation would print that whole comment as the selector.
    var scope = m[1]
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .pop()
      .trim();
    var modifier = m[2];
    var selector = scope + ".ds-tag--" + modifier;
    var owner = /\.ds-tag-stage\b/.test(scope)
      ? facts["tag-stage"] || resolveTagOwner(modifier, facts)
      : resolveTagOwner(modifier, facts);
    checkRuleBody(
      "ds-base.css",
      selector,
      m[3],
      factColors(owner),
      tokenMap,
      violations,
    );
  }
  var cbFacts = factColors(facts["checkbox"]);
  var cre = /\.ds-checkbox--indeterminate[^{]*\{([^}]*)\}/g;
  while ((m = cre.exec(cssText)) !== null) {
    var cbSelector = m[0].slice(0, m[0].indexOf("{")).trim();
    checkRuleBody(
      "ds-base.css",
      cbSelector,
      m[1],
      cbFacts,
      tokenMap,
      violations,
    );
  }
  return violations;
}

// Module scope, alongside the existing readAppearance require above.
// Deliberately NOT named A/D/fs/path: the require.main block below declares
// locals under those names, which are hoisted to this same module scope (the
// `if` block is not a function), so a module-scope `var` under one of those
// names would collide with (and be silently reassigned by) that block.
var CLASSIFY = require("./fidelity-classify.js");
var MATRIX = require("../../components/render/renderer/matrix.js");
// Fragment-aware rule attribution (below) needs filesystem access (reading
// each slug's fragment markup), so runFidelityReport is no longer purely
// readAppearance-only. Named to avoid the same fs/path collision as above.
var nodeFs = require("node:fs");
var nodePath = require("node:path");

// Which prefixes are claimed by more than one slug. Today this is exactly
// `.ds-tag` across the five tag-family members. Derived, never hand-listed, so
// a sixth member changes nothing here.
function sharedPrefixMap() {
  var claims = {};
  MATRIX.RENDER_SLUGS.forEach(function (slug) {
    MATRIX.ownedPrefixes(slug).forEach(function (p) {
      (claims[p] = claims[p] || []).push(slug);
    });
  });
  return claims;
}

// The full ds-* class tokens (root, BEM element, and modifier forms alike)
// a fragment's rendered markup emits, read straight from its class="..."
// attributes. A render fragment shows every matrix cell in its gallery (e.g.
// tag-default's fragment carries every ds-tag--<color> modifier it renders),
// so this is the complete set of classes that slug's markup can ever trigger
// a ds-base.css rule through.
function fragmentClasses(html) {
  var set = new Set();
  var re = /class="([^"]*)"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    m[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach(function (t) {
        if (/^ds-/.test(t)) set.add(t);
      });
  }
  return set;
}

// Every full ".ds-*" class token referenced anywhere in a selector.
// Pseudo-classes, attribute selectors, and bare element selectors are not
// class tokens and are never returned: ".ds-link:hover" yields only
// "ds-link", so a fragment that emits ds-link keeps that rule.
var SELECTOR_CLASS_TOKEN_RE = /\.ds-[a-z0-9_-]+/g;
function selectorClassTokens(selector) {
  var out = [];
  var m;
  SELECTOR_CLASS_TOKEN_RE.lastIndex = 0;
  while ((m = SELECTOR_CLASS_TOKEN_RE.exec(selector)) !== null) {
    out.push(m[0].slice(1));
  }
  return out;
}

// The prefix (from `prefixes`, in order) that owns a rule's selector, or null
// if none does. Same match rule ownedRules (fidelity-classify.js) uses, so
// "the owning prefix" means the same thing in both places: a single trailing
// hyphen is rejected, so `.ds-loader` does not absorb `.ds-loader-with-logo`.
function owningPrefixOf(selector, prefixes) {
  for (var i = 0; i < prefixes.length; i++) {
    var selRe = new RegExp("\\." + prefixes[i] + "(?![a-z0-9])(?!-(?!-))");
    if (selRe.test(selector)) return prefixes[i];
  }
  return null;
}

// Fragment-aware rule attribution applies ONLY to a rule whose owning prefix
// is claimed by more than one slug. CSS_OWNERS
// assigns the prefix ds-tag to five slugs, and .ds-tag* carries rules for
// every family member's own modifiers and descendants (tag-stage's dot, the
// grouped tag-status rules, every color modifier...), so without this filter
// a slug like tag-catalog -- whose fragment only ever emits ds-tag,
// ds-tag--catalog, and ds-tag__icon -- is charged for rules it can never
// actually trigger. That is a genuine cross-component attribution error, and
// this filter fixes it.
//
// A rule whose owning prefix has exactly one owner carries no such ambiguity
// -- there is no other slug it could be misattributed to -- so it is kept
// unconditionally, even when the fragment's own curated matrix cells never
// happen to render it. A component's own unrendered variant (e.g. button's
// --small size, or an icon slot the gallery specimen never fills) is real
// paint the component can produce; it still needs a capture fact one day, and
// dropping it from the denominator would hide that capture work rather than
// size it.
//
// Drops a rule when its owning prefix is shared AND any class token in its
// selector is absent from the fragment's emitted set. A rule with no ds-*
// class token at all (should not occur among ownedRules' candidates, but
// conservative here) is kept: an empty token list vacuously passes.
//
// Deliberately does NOT deduplicate declarations across slugs: two rules with
// identical selector text can still be kept for two different slugs (e.g.
// .ds-tag--orange for both tag-default and tag-stage) when both fragments
// emit the class -- each is then classified against ITS OWN capture, which is
// how a real cross-capture contradiction (tag-default verifies, tag-stage
// mismatches) stays visible instead of being silently collapsed.
function filterCssForFragment(css, emitted, prefixes, sharedPrefixes) {
  var pfx = prefixes || [];
  var shared = sharedPrefixes || {};
  var em = emitted || new Set();
  var stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  var out = [];
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  while ((m = re.exec(stripped)) !== null) {
    var selector = m[1].trim();
    var owner = owningPrefixOf(selector, pfx);
    var isShared = owner !== null && (shared[owner] || []).length > 1;
    if (isShared) {
      var tokens = selectorClassTokens(selector);
      var keep = tokens.every(function (t) {
        return em.has(t);
      });
      if (!keep) continue;
    }
    out.push(selector + " {" + m[2] + "}");
  }
  return out.join("\n");
}

// The build-failure text for a non-empty mismatch list. Kept out of the CLI
// block so its content is unit-testable: a message that tells a future
// engineer the wrong thing is as much a defect as a wrong classification, and
// there is no other way to assert on it.
//
// The two resolutions named here are the only two there are. An ignore list is
// deliberately absent: an allowlist is a hand-maintained set of facts that
// goes stale, which is the exact pattern this gate exists to end.
function mismatchFailureMessage(mismatches) {
  return (
    "FIDELITY MISMATCHES (" +
    mismatches.length +
    "):\n" +
    mismatches
      .map(function (m) {
        return "  " + m.message;
      })
      .join("\n") +
    "\nEach one is a render painting a color its Figma capture contradicts.\n" +
    "Fix the token binding in components/render/renderer/ds-base.css (bind a\n" +
    "token, never a raw hex), or if the classifier is wrong, add a case to\n" +
    "tests/render/fidelity-classify.test.js reproducing it and fix the rule in\n" +
    "scripts/render/fidelity-classify.js.\n" +
    "Adding an ignore list is NOT an option: an allowlist is a hand-maintained\n" +
    "fact set that goes stale, which is the pattern this gate exists to end.\n"
  );
}

// Walk every render slug and classify every color declaration it owns.
//
// This is the loop that replaces the inert `if (r.source !== "derived")
// return;` skip. That skip meant the gate printed "fidelity: OK" while
// examining ZERO of the 63 renders, which is how two slices shipped 28 renders
// under a green check that verified none of them.
function runFidelityReport(ctx) {
  // Name the actually-missing ctx key, not the whole required shape.
  // A message that always lists all four keys makes a test regex for any ONE
  // key match regardless of which key is truly absent -- that is satisfiable
  // by an unrelated failure, not proof of the specific guard. Checked in this
  // fixed order so the first absent key is the one named.
  var REQUIRED_CTX_KEYS = ["anatomyDir", "css", "tokenMap", "fragmentsDir"];
  var missingCtxKey = null;
  for (var reqIdx = 0; reqIdx < REQUIRED_CTX_KEYS.length; reqIdx++) {
    if (!ctx || !ctx[REQUIRED_CTX_KEYS[reqIdx]]) {
      missingCtxKey = REQUIRED_CTX_KEYS[reqIdx];
      break;
    }
  }
  if (missingCtxKey)
    throw new Error(
      "runFidelityReport requires ctx." +
        missingCtxKey +
        ": it reads only the per-slug appearance facts and fragment markup, " +
        "so the caller controls everything else about what is measured.",
    );
  var css = ctx.css;
  var tokenMap = ctx.tokenMap;
  var shared = sharedPrefixMap();

  var bySlug = {};
  var mismatches = [];
  var tokenNameAgreements = [];
  var reasons = {};
  var blind = [];
  var totals = {
    verified: 0,
    // Token-name-agreement-with-differing-hex is tallied separately from
    // `verified` so its size is visible rather than rounded into the same
    // bucket as a direct hex match. Counted toward
    // checkable/examined below (it IS a declaration the capture can speak
    // to, and does speak to), never toward `mismatch`.
    verifiedViaTokenName: 0,
    mismatch: 0,
    unverifiable: 0,
    overridden: 0,
  };

  MATRIX.RENDER_SLUGS.slice()
    .sort()
    .forEach(function (slug) {
      var facts = null;
      try {
        facts = readAppearance(slug, ctx.anatomyDir);
      } catch (e) {
        facts = null;
      }

      var fragmentHtml = "";
      try {
        fragmentHtml = nodeFs.readFileSync(
          nodePath.join(ctx.fragmentsDir, slug + ".html"),
          "utf8",
        );
      } catch (e) {
        fragmentHtml = "";
      }
      var emitted = fragmentClasses(fragmentHtml);
      var prefixes = MATRIX.ownedPrefixes(slug);
      var filteredCss = filterCssForFragment(css, emitted, prefixes, shared);

      var r = CLASSIFY.classifySlug({
        slug: slug,
        prefixes: prefixes,
        css: filteredCss,
        facts: facts,
        tokenMap: tokenMap,
        sharedPrefixes: shared,
      });
      // A gate whose subject can be absent must assert the subject was
      // present. A slug with zero verified AND zero mismatch is one the
      // capture can say nothing about at all -- that must be countable and
      // explicit, not indistinguishable from a slug that was actually
      // checked and found clean. The `blind` flag is carried on the bySlug
      // row itself (not only the top-level `blind` array) so a consumer that
      // filters bySlug directly (e.g. for mismatch === 0) sees the flag
      // without having to remember to join the sibling array -- honesty here
      // must not depend on the consumer's memory.
      //
      // verifiedViaTokenName is a real, positive signal (the capture spoke,
      // and agreed) -- a slug with zero verified and zero mismatch but a
      // non-zero verifiedViaTokenName is not blind, the capture said
      // something about it. badge is exactly this case.
      var isBlind =
        r.verified === 0 && r.mismatch === 0 && r.verifiedViaTokenName === 0;
      bySlug[slug] = {
        prefixes: r.prefixes,
        verified: r.verified,
        verifiedViaTokenName: r.verifiedViaTokenName,
        mismatch: r.mismatch,
        unverifiable: r.unverifiable,
        // Declarations another rule in the same slug's own CSS overrides, so
        // they are not paint and are outside every other bucket. Reported
        // rather than silently dropped: an unreported exclusion is the same
        // laundering the rest of this report exists to end.
        overridden: r.overridden,
        blind: isBlind,
      };
      if (isBlind) blind.push(slug);
      totals.verified += r.verified;
      totals.verifiedViaTokenName += r.verifiedViaTokenName;
      totals.mismatch += r.mismatch;
      totals.unverifiable += r.unverifiable;
      totals.overridden += r.overridden;
      Object.keys(r.reasons).forEach(function (k) {
        reasons[k] = (reasons[k] || 0) + r.reasons[k];
      });
      r.mismatches.forEach(function (m) {
        mismatches.push(m);
      });
      r.tokenNameAgreements.forEach(function (t) {
        tokenNameAgreements.push(t);
      });
    });

  // verifiedViaTokenName is part of the comparable/checkable set: the
  // capture DID speak to these declarations, and agreed on the binding, so
  // excluding them here would shrink `examined` under the exact same
  // declarations the report already counted before this bucket existed (they
  // were simply inside plain `verified` before). verifiedFidelity's
  // numerator stays `verified` alone (a direct hex match) so the headline
  // number does not silently absorb a hex divergence that a stale token
  // snapshot produced -- that divergence is real and now sized on its own
  // line instead.
  var checkable =
    totals.verified + totals.verifiedViaTokenName + totals.mismatch;
  var examined = checkable + totals.unverifiable;
  // Two honest numbers. verifiedFidelity answers "of what the capture can speak
  // to, how much is right". oracleCoverage answers "how much of what we paint
  // can the capture speak to at all", and THAT is the roadmap input: it sizes
  // the Figma capture work per component.
  totals.oracleCoverage = examined
    ? Number((checkable / examined).toFixed(4))
    : 0;
  totals.verifiedFidelity = checkable
    ? Number((totals.verified / checkable).toFixed(4))
    : 0;
  totals.examined = examined;

  return {
    totals: totals,
    bySlug: bySlug,
    mismatches: mismatches,
    tokenNameAgreements: tokenNameAgreements,
    reasons: reasons,
    blind: blind,
  };
}

// The number of declarations the capture can speak to at all: the numerator of
// oracleCoverage. `mismatch` belongs in it because the capture DID address
// those declarations (it addressed them and disagreed, which is why they block
// on their own line); leaving them out would make a mismatch look like a
// coverage loss and double-report one defect as two.
function checkableCount(totals) {
  if (!totals) return 0;
  return (
    (totals.verified || 0) +
    (totals.verifiedViaTokenName || 0) +
    (totals.mismatch || 0)
  );
}

// Compare a freshly computed report against the one committed in dist.
//
// Oracle coverage was 14.6% when this gate first examined all 63 renders
// (2026-07-24), 11.8% on 2026-08-11, and would be 9.1% if the held tag sync
// landed as authored -- with `mismatch` at 0 the whole time, so the gate was
// correct and silent while its own subject eroded by a third. This closes that.
//
// The BLOCKING condition is the absolute checkable count, not the ratio. A
// declaration that used to be confirmable and now is not is unambiguously
// worse. A new component the capture is blind to also lowers the ratio while
// losing nothing, and blocking on that would red an ordinary additive Figma
// sync every time a component lands, which is how a gate becomes noise and
// then stops being read. The ratio is always REPORTED for direction.
// oracleCoverage as the report states it, or recomputed when the field is
// absent. Reading it raw made pct(undefined) render 0.0%, so a headline could
// say "0.0% -> 9.1%" on a run that was blocking for a LOSS, which reads as a
// gain to anyone skimming.
function ratioOf(rep) {
  var t = (rep && rep.totals) || null;
  if (!t) return 0;
  if (typeof t.oracleCoverage === "number") return t.oracleCoverage;
  var checkable = checkableCount(t);
  var examined =
    typeof t.examined === "number"
      ? t.examined
      : checkable + (t.unverifiable || 0);
  return examined ? Number((checkable / examined).toFixed(4)) : 0;
}

function coverageRegression(prev, next) {
  if (!prev || !prev.totals) return null;
  var from = checkableCount(prev.totals);
  var to = checkableCount(next.totals);

  var prevBySlug = prev.bySlug || {};
  var nextBySlug = next.bySlug || {};
  var lost = [];
  var newlyBlind = [];
  Object.keys(prevBySlug).forEach(function (slug) {
    var before = checkableCount(prevBySlug[slug]);
    // A slug that disappeared entirely lost everything it had. Reporting it
    // as 0 is honest: whether it was renamed or removed, the capture no
    // longer confirms those declarations under that name.
    var after = nextBySlug[slug] ? checkableCount(nextBySlug[slug]) : 0;
    if (after < before) lost.push({ slug: slug, from: before, to: after });
    if (!prevBySlug[slug].blind && nextBySlug[slug] && nextBySlug[slug].blind) {
      newlyBlind.push(slug);
    }
  });
  // Worst loss first, so the first line a reader sees is the biggest subject.
  // Alphabetical tie-break keeps the output stable across runs.
  lost.sort(function (a, b) {
    var byLoss = b.from - b.to - (a.from - a.to);
    if (byLoss !== 0) return byLoss;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });

  // Block on EITHER a per-slug loss or a fall in the repo-wide total.
  //
  // The first version returned here on the total alone, before this loop ran,
  // and a review found the hole: a slug going FULLY BLIND passed silently
  // whenever another slug gained as many declarations in the same change.
  // That is precisely the erosion shape the gate was built for, since a Figma
  // redesign that retires the tag borders can easily coincide with a
  // token-name gain elsewhere. The per-slug list is the subject; the total is
  // only the headline.
  if (!lost.length && to >= from) return null;

  return {
    checkableFrom: from,
    checkableTo: to,
    coverageFrom: ratioOf(prev),
    coverageTo: ratioOf(next),
    lost: lost,
    newlyBlind: newlyBlind,
  };
}

function pct(x) {
  return (Number(x || 0) * 100).toFixed(1) + "%";
}

function coverageFailureMessage(reg) {
  var lines = [
    "ORACLE COVERAGE REGRESSED: " +
      reg.checkableFrom +
      " -> " +
      reg.checkableTo +
      " checkable color declarations (" +
      pct(reg.coverageFrom) +
      " -> " +
      pct(reg.coverageTo) +
      ").",
    "Declarations the Figma capture used to be able to confirm no longer are.",
    "",
    "Slugs that lost verification:",
  ];
  reg.lost.forEach(function (l) {
    lines.push("  " + l.slug + ": " + l.from + " -> " + l.to);
  });
  if (reg.newlyBlind.length) {
    lines.push("");
    lines.push(
      "Newly blind, the capture can now say nothing at all about these: " +
        reg.newlyBlind.join(", "),
    );
  }
  lines.push("");
  lines.push(
    "",
    "A loss can be legitimate: a design change can retire the very treatment the",
    "oracle was reading. It may not be silent, and it cannot be waved through",
    "from CI, which runs this gate with no arguments. To land one, do it locally",
    "and say why:",
    "",
    '  npm run derive:render -- --accept-coverage-loss="<why>"',
    "  git add components/render/dist/fidelity-report.json",
    "",
    "That run records the lower baseline, so the check then passes on the",
    "committed value. Put the same sentence in the CHANGELOG entry, because the",
    "reason lives in that commit and nowhere else.",
    "",
    "Running this gate again WITHOUT the flag will not help: on a blocking loss",
    "it deliberately leaves the report untouched.",
  );
  return lines.join("\n") + "\n";
}

// Accepts both `--flag=value` and `--flag value`. The equals-only version was a
// trap: an author typing the natural space-separated form got the identical
// wall of failure text with no hint the flag had been seen and ignored.
function flagValue(argv, name) {
  var eq = "--" + name + "=";
  var bare = "--" + name;
  var list = argv || [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (typeof a !== "string") continue;
    if (a.indexOf(eq) === 0) {
      var inline = a.slice(eq.length).trim();
      return inline ? inline : null;
    }
    if (a === bare) {
      var next = list[i + 1];
      if (typeof next === "string" && next.indexOf("--") !== 0 && next.trim()) {
        return next.trim();
      }
      return null;
    }
  }
  return null;
}

function flagPresent(argv, name) {
  var bare = "--" + name;
  var eq = bare + "=";
  return (argv || []).some(function (a) {
    return typeof a === "string" && (a === bare || a.indexOf(eq) === 0);
  });
}

// Returns the stated reason, or null. A bare flag with no reason is NOT
// acceptance: a switch that waves the gate through without saying why is the
// silent pass this gate exists to remove.
function acceptedCoverageLoss(argv) {
  return flagValue(argv, "accept-coverage-loss");
}

// Relocates the report the run reads its baseline from AND writes its result
// to. Exists for tests: doctoring the committed report in place races sibling
// test files, which `node --test` runs in parallel. Both ends move together on
// purpose, so the read-before-write ordering the gate depends on stays under
// test.
function reportPathOverride(argv) {
  return flagValue(argv, "report");
}

if (require.main === module) {
  var fs = require("node:fs");
  var path = require("node:path");
  var D = require("./derive-canonical.js");
  var A = require("./derive-appearance.js");
  var root = path.resolve(__dirname, "..", "..");
  var anatomyDir = path.join(root, "components", "dist", "anatomy");
  var out = D.deriveCanonical();
  var tokenMap = A.loadTokenMap(out.css);
  var v = fidelityCheck(out, {
    anatomyDir: anatomyDir,
    tokenMap: tokenMap,
  });
  var dsBaseCss = fs.readFileSync(
    path.join(root, "components", "render", "renderer", "ds-base.css"),
    "utf8",
  );
  v = v.concat(
    checkBaseCssRules(
      dsBaseCss,
      {
        "tag-default": A.readAppearance("tag-default", anatomyDir),
        "tag-catalog": A.readAppearance("tag-catalog", anatomyDir),
        "tag-shared": A.readAppearance("tag-shared", anatomyDir),
        "tag-status": A.readAppearance("tag-status", anatomyDir),
        // Owner for rules scoped to .ds-tag-stage (see checkBaseCssRules).
        "tag-stage": A.readAppearance("tag-stage", anatomyDir),
        // Deliberately NO "tag-gray" entry. An earlier pass registered one
        // pointing at tag-stage so a .ds-tag--gray rule carrying tag-stage's
        // #e1e1e6 would pass, which made the gate agree with a wrong colour by
        // construction instead of catching it. Gray is still a tag-default
        // Color; it simply equals Color=Default now, so an unscoped
        // .ds-tag--gray belongs to tag-default and the default fallback checks
        // it correctly. tag-stage's own Gray is a scoped rule and routes via
        // the selector.
        checkbox: A.readAppearance("checkbox", anatomyDir),
      },
      tokenMap,
    ),
  );

  var fragmentsDir = path.join(
    root,
    "components",
    "render",
    "dist",
    "fragments",
  );
  var reportPath =
    reportPathOverride(process.argv) ||
    path.join(root, "components", "render", "dist", "fidelity-report.json");
  if (reportPathOverride(process.argv)) {
    process.stdout.write(
      "FIXTURE RUN: baseline and output relocated to " +
        reportPath +
        "; the tracked dist report was NOT updated.\n",
    );
  }

  // Read the committed report BEFORE the write below replaces it. This ordering
  // is the whole gate: this script is the only writer of that file and it runs
  // last in `derive:render`, so what is on disk right now is the baseline this
  // branch inherited. Move this read after the write and the comparison becomes
  // new-against-new, which always passes.
  var previous = null;
  var previousRaw = null;
  try {
    previousRaw = fs.readFileSync(reportPath, "utf8");
  } catch (e) {
    // No committed report yet (a fresh checkout of a branch that adds it, or
    // the very first run). Nothing to compare against is not a regression, but
    // say so, because a silent skip is indistinguishable from a passing
    // comparison in a CI log.
    process.stdout.write(
      "  NOTE: no previous fidelity-report.json at " +
        reportPath +
        ", so there is no coverage baseline to compare against on this run.\n",
    );
  }
  if (previousRaw !== null) {
    try {
      previous = JSON.parse(previousRaw);
    } catch (e) {
      // A corrupt baseline must NOT fall back to "no comparison". That turns
      // the gate straight back into the silent pass it was added to remove,
      // and the same run would then rewrite the file so the bypass left no
      // trace in the diff.
      process.stderr.write(
        "FIDELITY BASELINE UNREADABLE: " +
          reportPath +
          " exists but could not be parsed (" +
          e.message +
          ").\n" +
          "Refusing to run the coverage comparison against nothing. Restore the " +
          "committed report (git checkout -- " +
          "components/render/dist/fidelity-report.json) and re-run.\n",
      );
      process.exit(1);
    }
  }

  var report = runFidelityReport({
    anatomyDir: anatomyDir,
    css: dsBaseCss,
    tokenMap: tokenMap,
    fragmentsDir: fragmentsDir,
  });
  var reportJson =
    JSON.stringify(
      {
        _meta: {
          auto_generated: true,
          source: "scripts/render/fidelity-check.js",
          do_not_edit:
            "Regenerated by `npm run derive:render`. Edits are overwritten.",
        },
        totals: report.totals,
        reasons: report.reasons,
        bySlug: report.bySlug,
        blind: report.blind,
        mismatches: report.mismatches,
        tokenNameAgreements: report.tokenNameAgreements,
      },
      null,
      2,
    ) + "\n";
  process.stdout.write(
    "fidelity: examined " +
      report.totals.examined +
      " color declarations across " +
      Object.keys(report.bySlug).length +
      " renders\n" +
      "  verified:     " +
      report.totals.verified +
      "\n" +
      "  verified via token name: " +
      report.totals.verifiedViaTokenName +
      " (the binding agrees with the token the capture names, but the " +
      "resolved hex differs -- points at a stale tokens/tokens.css " +
      "snapshot or a theme-mode difference, not a CSS defect; does not " +
      "block the build; see fidelity-report.json#tokenNameAgreements)\n" +
      "  mismatch:     " +
      report.totals.mismatch +
      "\n" +
      "  unverifiable: " +
      report.totals.unverifiable +
      "\n" +
      "  overridden:   " +
      report.totals.overridden +
      " (a later rule in the same slug's CSS paints this subject instead, so " +
      "the declaration is not paint and is outside the buckets above)\n" +
      "  blind slugs:  " +
      report.blind.length +
      " (zero verified, zero mismatch, and zero token-name agreement -- the " +
      "capture can say nothing about them at all; see fidelity-report.json#blind)\n" +
      "  verified fidelity: " +
      (report.totals.verifiedFidelity * 100).toFixed(1) +
      "%\n" +
      "  ORACLE COVERAGE:   " +
      (report.totals.oracleCoverage * 100).toFixed(1) +
      "%  (how much of what we paint the capture can speak to)\n",
  );
  var regression = coverageRegression(previous, report);
  var acceptedLoss = regression ? acceptedCoverageLoss(process.argv) : null;
  if (
    regression &&
    !acceptedLoss &&
    flagPresent(process.argv, "accept-coverage-loss")
  ) {
    process.stderr.write(
      "--accept-coverage-loss was passed WITHOUT A REASON, so nothing was " +
        'accepted. Give it one: --accept-coverage-loss="<why>".\n',
    );
  }
  if (regression && acceptedLoss) {
    process.stdout.write(
      "  ACCEPTED COVERAGE LOSS: " +
        regression.checkableFrom +
        " -> " +
        regression.checkableTo +
        " checkable declarations, allowed on this run because: " +
        acceptedLoss +
        "\n  Put the same sentence in the CHANGELOG entry; this line lives only in " +
        "a CI log.\n",
    );
  }

  if (report.mismatches.length) {
    process.stderr.write(mismatchFailureMessage(report.mismatches));
  }
  if (regression && !acceptedLoss) {
    process.stderr.write(coverageFailureMessage(regression));
  }

  if (v.length) {
    process.stderr.write(
      "FIDELITY VIOLATIONS:\n" +
        v
          .map(function (x) {
            return "  " + x;
          })
          .join("\n") +
        "\n",
    );
  }
  // A BLOCKING COVERAGE LOSS MUST NOT REWRITE THE BASELINE IT COMPARED AGAINST.
  //
  // The first version wrote the report before evaluating the regression, and a
  // review found that this made the gate self-erasing: it failed once, and the
  // very next run compared the new value against itself and passed, so an
  // author who re-ran to confirm, or who simply committed the regenerated dist,
  // landed the regression with no reason recorded. That is the laundering path
  // the gate exists to close, reopened by the gate. On a blocking loss the
  // committed baseline stays untouched, so the failure is reproducible until it
  // is either fixed or accepted by name.
  var blockingLoss = Boolean(regression && !acceptedLoss);
  if (!blockingLoss) {
    fs.writeFileSync(reportPath, reportJson);
  } else {
    process.stderr.write(
      "\n" +
        reportPath +
        " was left UNCHANGED so this failure stays reproducible. Committing a " +
        "regenerated report is not a fix.\n",
    );
  }

  // All failure classes are printed before any of them exits, so one run
  // reports everything that is wrong rather than only the first kind
  // encountered.
  if (report.mismatches.length || v.length || blockingLoss) {
    process.exit(1);
  }
  // No unconditional "fidelity: OK" trailer here. The legacy
  // fidelityCheck/checkBaseCssRules violation reporting above still gates
  // ds-base.css tag/checkbox rules and still exits 1 on a real violation --
  // that check is intact. What is gone is the success text that used to run
  // AFTER the real summary regardless of it, so the last line of a CI log
  // read "fidelity: OK" even on a run whose entire purpose was to end that
  // false all-clear. The honest summary printed above (verified/mismatch/
  // unverifiable/blind/oracle coverage) is now the last thing printed.
}

module.exports = {
  fidelityCheck: fidelityCheck,
  factColors: factColors,
  slugCss: slugCss,
  checkBaseCssRules: checkBaseCssRules,
  resolveTagOwner: resolveTagOwner,
  runFidelityReport: runFidelityReport,
  mismatchFailureMessage: mismatchFailureMessage,
  checkableCount: checkableCount,
  coverageRegression: coverageRegression,
  coverageFailureMessage: coverageFailureMessage,
  acceptedCoverageLoss: acceptedCoverageLoss,
  reportPathOverride: reportPathOverride,
  flagPresent: flagPresent,
  ratioOf: ratioOf,
  sharedPrefixMap: sharedPrefixMap,
  fragmentClasses: fragmentClasses,
  filterCssForFragment: filterCssForFragment,
};
