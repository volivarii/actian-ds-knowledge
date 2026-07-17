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

// Scope: this gate validates the colors in the derived-from-facts CSS
// appendix only. Inline colors in the fragment markup are out of scope.
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
      var body = m[2];
      // hex literals emitted must be a fact value
      (body.match(/#[0-9a-fA-F]{3,8}/g) || []).forEach(function (hex) {
        if (!ok.has(hex.toLowerCase()))
          violations.push(
            r.slug +
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
            r.slug + " " + selector + ": token " + tok + " is undefined",
          );
        else if (!ok.has(tokenMap[tok].toLowerCase()))
          violations.push(
            r.slug +
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
  });
  return violations;
}

if (require.main === module) {
  var path = require("node:path");
  var D = require("./derive-canonical.js");
  var A = require("./derive-appearance.js");
  var root = path.resolve(__dirname, "..", "..");
  var out = D.deriveCanonical(path.join(root, "components", "render", "src"));
  var v = fidelityCheck(out, {
    anatomyDir: path.join(root, "components", "dist", "anatomy"),
    tokenMap: A.loadTokenMap(out.css),
  });
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
  process.stdout.write("fidelity: OK (derived renders match facts)\n");
}

module.exports = {
  fidelityCheck: fidelityCheck,
  factColors: factColors,
  slugCss: slugCss,
};
