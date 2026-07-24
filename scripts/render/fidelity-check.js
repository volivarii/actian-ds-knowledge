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
  // tokens emitted must be defined + round-trip to a fact value
  (body.match(/var\((--zen-[a-z0-9-]+)\)/g) || []).forEach(function (v) {
    var tok = v.slice(4, -1);
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
  var re = /\.ds-tag--([a-z0-9-]+)\s*\{([^}]*)\}/g;
  var m;
  while ((m = re.exec(cssText)) !== null) {
    var modifier = m[1];
    var owner = resolveTagOwner(modifier, facts);
    checkRuleBody(
      "ds-base.css",
      ".ds-tag--" + modifier,
      m[2],
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
// Amendment 1 needs filesystem access (reading each slug's fragment markup),
// so runFidelityReport is no longer purely readAppearance-only. Named to
// avoid the same fs/path collision as above.
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

// Amendment 1, narrowed: fragment-aware rule attribution applies ONLY to a
// rule whose owning prefix is claimed by more than one slug. CSS_OWNERS
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
        return emitted.has(t);
      });
      if (!keep) continue;
    }
    out.push(selector + " {" + m[2] + "}");
  }
  return out.join("\n");
}

// Walk every render slug and classify every color declaration it owns.
//
// This is the loop that replaces the inert `if (r.source !== "derived")
// return;` skip. That skip meant the gate printed "fidelity: OK" while
// examining ZERO of the 63 renders, which is how two slices shipped 28 renders
// under a green check that verified none of them.
function runFidelityReport(ctx) {
  if (!ctx || !ctx.anatomyDir || !ctx.css || !ctx.tokenMap || !ctx.fragmentsDir)
    throw new Error(
      "runFidelityReport requires {anatomyDir, css, tokenMap, fragmentsDir}: " +
        "it reads only the per-slug appearance facts and fragment markup, so " +
        "the caller controls everything else about what is measured.",
    );
  var css = ctx.css;
  var tokenMap = ctx.tokenMap;
  var shared = sharedPrefixMap();

  var bySlug = {};
  var mismatches = [];
  var reasons = {};
  var blind = [];
  var totals = { verified: 0, mismatch: 0, unverifiable: 0 };

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
      var slugCss = filterCssForFragment(css, emitted, prefixes, shared);

      var r = CLASSIFY.classifySlug({
        slug: slug,
        prefixes: prefixes,
        css: slugCss,
        facts: facts,
        tokenMap: tokenMap,
        sharedPrefixes: shared,
      });
      bySlug[slug] = {
        prefixes: r.prefixes,
        verified: r.verified,
        mismatch: r.mismatch,
        unverifiable: r.unverifiable,
      };
      // Amendment 2: a gate whose subject can be absent must assert the
      // subject was present. A slug with zero verified AND zero mismatch is
      // one the capture can say nothing about at all -- that must be
      // countable and explicit, not indistinguishable from a slug that was
      // actually checked and found clean.
      if (r.verified === 0 && r.mismatch === 0) blind.push(slug);
      totals.verified += r.verified;
      totals.mismatch += r.mismatch;
      totals.unverifiable += r.unverifiable;
      Object.keys(r.reasons).forEach(function (k) {
        reasons[k] = (reasons[k] || 0) + r.reasons[k];
      });
      r.mismatches.forEach(function (m) {
        mismatches.push(m);
      });
    });

  var checkable = totals.verified + totals.mismatch;
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
    reasons: reasons,
    blind: blind,
  };
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
  var derivedRenders = (out.manifest.renders || []).filter(function (r) {
    return r.source === "derived";
  });
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
  var report = runFidelityReport({
    anatomyDir: anatomyDir,
    css: dsBaseCss,
    tokenMap: tokenMap,
    fragmentsDir: fragmentsDir,
  });
  fs.writeFileSync(
    path.join(root, "components", "render", "dist", "fidelity-report.json"),
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
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    "fidelity: examined " +
      report.totals.examined +
      " color declarations across " +
      Object.keys(report.bySlug).length +
      " renders\n" +
      "  verified:     " +
      report.totals.verified +
      "\n" +
      "  mismatch:     " +
      report.totals.mismatch +
      "\n" +
      "  unverifiable: " +
      report.totals.unverifiable +
      "\n" +
      "  blind slugs:  " +
      report.blind.length +
      " (zero verified and zero mismatch -- the capture can say nothing about " +
      "them at all; see fidelity-report.json#blind)\n" +
      "  verified fidelity: " +
      (report.totals.verifiedFidelity * 100).toFixed(1) +
      "%\n" +
      "  ORACLE COVERAGE:   " +
      (report.totals.oracleCoverage * 100).toFixed(1) +
      "%  (how much of what we paint the capture can speak to)\n",
  );
  if (report.mismatches.length) {
    process.stdout.write(
      "  candidate mismatches (NOT blocking yet, see task 6):\n" +
        report.mismatches
          .map(function (m) {
            return "    " + m.message;
          })
          .join("\n") +
        "\n",
    );
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
    process.exit(1);
  }
  if (derivedRenders.length === 0) {
    process.stdout.write(
      "fidelity: OK, 0 derived renders examined (TEMPLATES is empty, so " +
        "fidelityCheck had nothing to check; ds-base.css tag/checkbox rules " +
        "verified separately, above)\n",
    );
  } else {
    process.stdout.write(
      "fidelity: OK (" +
        derivedRenders.length +
        " derived render(s) matched facts)\n",
    );
  }
}

module.exports = {
  fidelityCheck: fidelityCheck,
  factColors: factColors,
  slugCss: slugCss,
  checkBaseCssRules: checkBaseCssRules,
  resolveTagOwner: resolveTagOwner,
  runFidelityReport: runFidelityReport,
  sharedPrefixMap: sharedPrefixMap,
  fragmentClasses: fragmentClasses,
  filterCssForFragment: filterCssForFragment,
};
