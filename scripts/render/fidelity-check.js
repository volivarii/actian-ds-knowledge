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

// Slice 2 folded the tag color variants + the checkbox indeterminate rule
// into the shared ds-base.css asset (renderer relocation phase 1b-alpha),
// outside the derived-from-facts appendix `fidelityCheck` scans above. This
// verifies THOSE rules against the same fact-color invariant, extracted by
// selector (robust to ds-base.css's comment headers moving or changing).
// `cssText` is ds-base.css's content and `facts` maps a fact-source name
// (e.g. "tag-default", "checkbox") to its readAppearance() result, so the
// caller controls which anatomy facts each selector group is checked
// against.
function checkBaseCssRules(cssText, facts, tokenMap) {
  var violations = [];
  var tagFacts = factColors(facts["tag-default"]);
  var re = /\.ds-tag--[a-z0-9]+\s*\{([^}]*)\}/g;
  var m;
  while ((m = re.exec(cssText)) !== null) {
    var selector = m[0].slice(0, m[0].indexOf("{")).trim();
    checkRuleBody(
      "ds-base.css",
      selector,
      m[1],
      tagFacts,
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
        checkbox: A.readAppearance("checkbox", anatomyDir),
      },
      tokenMap,
    ),
  );
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
};
