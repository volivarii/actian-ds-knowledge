"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var D = require("../../scripts/render/derive-canonical.js");
var F = require("../../scripts/render/fidelity-check.js");
var A = require("../../scripts/render/derive-appearance.js");
var ANATOMY = path.resolve(__dirname, "../../components/dist/anatomy");
var REPO_ROOT = path.resolve(__dirname, "../..");

test('fidelityCheck: the real derive has zero source:"derived" renders today, so the loop has nothing to examine', function () {
  // TEMPLATES (templates/index.js) went empty in phase 1b-beta, so no slug in
  // the real derive carries source:"derived" and fidelityCheck's loop body
  // never runs. Asserting the real derive's violations deep-equal [] would
  // read like a passing verification while actually exercising an
  // unreachable code path: it would pass even if a real color/token
  // regression landed, because nothing would be examined either way.
  // Pinning the precondition instead makes that fact loud: the day a slug
  // is templated again, derivedCount stops being 0, this assertion fails,
  // and the failure message is the signal that the fidelity gate just went
  // live and needs real coverage (see the sibling "a wrong derived color is
  // caught" test below for how that coverage already works once it's live).
  var out = D.deriveCanonical();
  var derivedCount = (out.manifest.renders || []).filter(function (r) {
    return r.source === "derived";
  }).length;
  assert.equal(
    derivedCount,
    0,
    'a render now carries source:"derived", so fidelityCheck\'s loop is live ' +
      "and this precondition test's job is done; replace it with real " +
      "coverage of that render's derived-from-facts CSS",
  );
});

test("fidelityCheck: a wrong derived color is caught", function () {
  // fidelityCheck is retained for a future escape-hatch template, but no real
  // slug is templated now, so construct the source:"derived" canonical inline.
  // #000000 is not a tag-default appearance fact color, so the gate must name it.
  var canonical = {
    css: "/* tag-default (derived-from-facts) */\n.ds-tag--pink{background:#000000}\n",
    manifest: { renders: [{ slug: "tag-default", source: "derived" }] },
  };
  var v = F.fidelityCheck(canonical, { anatomyDir: ANATOMY, tokenMap: {} });
  assert.ok(
    v.some(function (m) {
      return /tag-default/.test(m) && /pink/.test(m);
    }),
    "violation names the bad color, got: " + JSON.stringify(v),
  );
});

test("fidelityCheck: an empty derived CSS block cannot pass silently", function () {
  // A render stamped source:"derived" with no derived-from-facts block to verify
  // must red, not pass silently.
  var canonical = {
    css: "",
    manifest: { renders: [{ slug: "tag-default", source: "derived" }] },
  };
  var v = F.fidelityCheck(canonical, { anatomyDir: ANATOMY, tokenMap: {} });
  assert.ok(
    v.some(function (m) {
      return (
        /^tag-default:/.test(m) && /no derived-from-facts CSS block/.test(m)
      );
    }),
    "violation names tag-default and the missing block, got: " +
      JSON.stringify(v),
  );
});

// Phase 1b-alpha: the tag color variants + the checkbox indeterminate rule
// live directly in ds-base.css (outside the derived-from-facts appendix
// covered above), so their fact-color correctness needs its own coverage.
test("checkBaseCssRules: the real ds-base.css tag/checkbox rules pass", function () {
  var dsBaseCss = fs.readFileSync(
    path.join(REPO_ROOT, "components", "render", "renderer", "ds-base.css"),
    "utf8",
  );
  var tokenMap = A.loadTokenMap(
    fs.readFileSync(path.join(REPO_ROOT, "tokens", "tokens.css"), "utf8"),
  );
  var facts = {
    "tag-default": A.readAppearance("tag-default", ANATOMY),
    // Gray-box-to-zero family 2: tag-catalog and tag-shared also emit
    // standalone .ds-tag--<x> rules with their OWN captured facts (not
    // tag-default's Color axis), so their facts must be in scope too or a
    // genuinely correct color reads as a violation.
    "tag-catalog": A.readAppearance("tag-catalog", ANATOMY),
    "tag-shared": A.readAppearance("tag-shared", ANATOMY),
    // tag-status: the grouped tag-status family (.ds-tag--status-error/
    // -info/-neutral/-success/-warning) is now checked too (Fix B widened
    // the modifier regex to cross hyphens), so its fact source must be
    // registered here too, mirroring the CLI's require.main registration.
    "tag-status": A.readAppearance("tag-status", ANATOMY),
    checkbox: A.readAppearance("checkbox", ANATOMY),
  };
  var v = F.checkBaseCssRules(dsBaseCss, facts, tokenMap);
  assert.deepEqual(v, []);
  // Non-vacuity: corrupt a REAL multi-line tag rule in ds-base.css and confirm
  // the gate catches it. Guards against a selector-regex regression that would
  // silently match nothing, making the pass above vacuous.
  var corrupted = dsBaseCss.replace(
    "background: #fff5f6;",
    "background: #123456;",
  );
  assert.notEqual(
    corrupted,
    dsBaseCss,
    "the real .ds-tag--pink background was located for corruption",
  );
  var vBad = F.checkBaseCssRules(corrupted, facts, tokenMap);
  assert.ok(
    vBad.some(function (m) {
      return /ds-tag--pink/.test(m) && /#123456/.test(m);
    }),
    "corrupting a real multi-line rule is caught, got: " + JSON.stringify(vBad),
  );
});

test("checkBaseCssRules: a fabricated modifier cannot pass by borrowing a sibling member's fact (per-owner, not union)", function () {
  // tag-catalog's real anatomy legitimately captures #000000 as a text
  // color (--zen-color-text-default). A prior version of checkBaseCssRules
  // unioned every "tag*" fact set together before checking any rule, so a
  // fabricated .ds-tag--bogus rule emitting #000000 would pass by borrowing
  // tag-catalog's fact even though no fact source that actually owns the
  // "bogus" modifier ever captured that value. This proves the per-owner
  // fix: "bogus" has no registered tag-bogus fact source, so it falls back
  // to tag-default -- whose Color axis never captured #000000 -- and must
  // still be flagged, even though tag-catalog (a sibling entry in the SAME
  // facts map) legitimately owns #000000.
  var facts = {
    "tag-default": A.readAppearance("tag-default", ANATOMY),
    "tag-catalog": A.readAppearance("tag-catalog", ANATOMY),
    checkbox: A.readAppearance("checkbox", ANATOMY),
  };
  var tokenMap = { "--zen-color-text-default": "#000000" };
  var cssText =
    ".ds-tag--bogus { background: #000000; }\n" +
    ".ds-tag--catalog { color: var(--zen-color-text-default); }\n";
  var v = F.checkBaseCssRules(cssText, facts, tokenMap);
  assert.ok(
    v.some(function (m) {
      return /\.ds-tag--bogus/.test(m) && /#000000/.test(m);
    }),
    "a fabricated .ds-tag--bogus borrowing tag-catalog's #000000 text-color " +
      "fact must still violate (checked against tag-default, which does not " +
      "own #000000), got: " +
      JSON.stringify(v),
  );
  assert.ok(
    !v.some(function (m) {
      return /\.ds-tag--catalog/.test(m);
    }),
    "legitimate .ds-tag--catalog color must pass (checked against its own " +
      "owning fact source, tag-catalog), got: " +
      JSON.stringify(v),
  );
});

test("checkBaseCssRules: a fabricated .ds-tag--status-error color is caught (hyphenated modifier is checked, not silently skipped)", function () {
  // Regression coverage for the regex-width bug: the modifier char class used
  // to be [a-z0-9]+, which cannot cross a hyphen, so the 5 real grouped
  // tag-status rules (.ds-tag--status-error/-info/-neutral/-success/
  // -warning) were silently never checked -- a fabricated #123456 in one of
  // them produced 0 violations. This proves the widened [a-z0-9-]+ regex now
  // captures the compound modifier AND resolveTagOwner resolves it to the
  // tag-status fact source (not tag-default, which never captured any of
  // these colors), so a planted bad color in the family is flagged.
  var tokenMap = A.loadTokenMap(
    fs.readFileSync(path.join(REPO_ROOT, "tokens", "tokens.css"), "utf8"),
  );
  var facts = {
    "tag-default": A.readAppearance("tag-default", ANATOMY),
    "tag-status": A.readAppearance("tag-status", ANATOMY),
    checkbox: A.readAppearance("checkbox", ANATOMY),
  };
  // #123456 is not a tag-status appearance fact color (planted fixture).
  var badCss = ".ds-tag--status-error{background:#123456}";
  var v = F.checkBaseCssRules(badCss, facts, tokenMap);
  assert.ok(
    v.some(function (m) {
      return (
        /^ds-base\.css/.test(m) &&
        /\.ds-tag--status-error/.test(m) &&
        /#123456/.test(m)
      );
    }),
    "violation names ds-base.css, the hyphenated selector, and the bad color, got: " +
      JSON.stringify(v),
  );
});

test("checkBaseCssRules: the real .ds-tag--status-* family rules pass, and comments inside the rule body are not mistaken for declarations", function () {
  // The real .ds-tag--status-* rules (unlike the single-word rules above
  // them) carry their value-first explanatory comment INSIDE the braces,
  // and that comment text itself mentions hex codes (the non-round-tripping
  // token's resolved value) that are NOT emitted declarations. Proves
  // checkRuleBody strips comments before scanning, so those mentions do not
  // read as false violations.
  var dsBaseCss = fs.readFileSync(
    path.join(REPO_ROOT, "components", "render", "renderer", "ds-base.css"),
    "utf8",
  );
  var tokenMap = A.loadTokenMap(
    fs.readFileSync(path.join(REPO_ROOT, "tokens", "tokens.css"), "utf8"),
  );
  var facts = {
    "tag-default": A.readAppearance("tag-default", ANATOMY),
    "tag-catalog": A.readAppearance("tag-catalog", ANATOMY),
    "tag-shared": A.readAppearance("tag-shared", ANATOMY),
    "tag-status": A.readAppearance("tag-status", ANATOMY),
    checkbox: A.readAppearance("checkbox", ANATOMY),
  };
  var v = F.checkBaseCssRules(dsBaseCss, facts, tokenMap);
  assert.deepEqual(v, []);
});

test("resolveTagOwner: compound modifier resolves by longest-registered-prefix, falls back to tag-default", function () {
  var facts = {
    "tag-default": { variants: [], byNode: [{ name: "default" }] },
    "tag-status": { variants: [], byNode: [{ name: "status" }] },
  };
  assert.equal(
    F.resolveTagOwner("status-error", facts).byNode[0].name,
    "status",
    "status-error strips to the registered tag-status prefix",
  );
  assert.equal(
    F.resolveTagOwner("indigo", facts).byNode[0].name,
    "default",
    "a plain color modifier with no registered tag-indigo falls back to tag-default",
  );
  assert.equal(
    F.resolveTagOwner("bogus-modifier", facts).byNode[0].name,
    "default",
    "an unregistered compound modifier falls back to tag-default at every prefix depth",
  );
});

var MATRIX = require("../../components/render/renderer/matrix.js");

// Mirrors derive-canonical.js's own stripComments: buildDeclaration scans
// cemStyle (assetBase + PAGE_CSS with comments stripped), not the raw
// out.css, so a comment referencing a --zen-* token inside a rule body
// would otherwise read as a false positive here. Kept local rather than a
// new export, since Task 2 adds no new exports.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

test("every CEM declaration ships a non-empty cssProperties token surface (#474)", function () {
  var out = D.deriveCanonical();
  var empty = [];
  (out.cem.modules || []).forEach(function (mod) {
    (mod.declarations || []).forEach(function (decl) {
      var slug = String(mod.path || "")
        .replace(/^.*\//, "")
        .replace(/\.[^.]*$/, "");
      if (!decl.cssProperties || decl.cssProperties.length === 0)
        empty.push(slug);
    });
  });
  assert.deepEqual(empty, [], "CEM declarations with an empty token surface");
});

test("tag-stage's token surface unions both of its owned prefixes", function () {
  var out = D.deriveCanonical();
  var mod = (out.cem.modules || []).find(function (m) {
    return /tag-stage/.test(String(m.path || ""));
  });
  var names = (mod.declarations[0].cssProperties || []).map(function (p) {
    return p.name;
  });
  // Derived, not a pinned count: the union must contain everything each owned
  // prefix contributes on its own, and tag-stage owns two.
  var style = stripComments(out.css);
  var expected = new Set();
  MATRIX.ownedPrefixes("tag-stage").forEach(function (p) {
    D.consumedVars(style, p).forEach(function (v) {
      expected.add(v);
    });
  });
  assert.ok(expected.size > 0, "the ownership probe itself found nothing");
  expected.forEach(function (v) {
    assert.ok(
      names.indexOf(v) !== -1,
      "token " +
        v +
        " is contributed by an owned prefix but missing from the CEM",
    );
  });
});

// The #472 regression: consumedVars' selector regex must keep rejecting a
// single trailing hyphen so `.ds-loader` does not absorb `.ds-loader-with-logo`.
test("consumedVars still separates hyphen-prefix slug pairs", function () {
  var css =
    ".ds-loader { color: var(--zen-a); } .ds-loader-with-logo { color: var(--zen-b); }";
  assert.deepEqual(D.consumedVars(css, "ds-loader"), ["--zen-a"]);
  assert.deepEqual(D.consumedVars(css, "ds-loader-with-logo"), ["--zen-b"]);
});

test("checkBaseCssRules: a planted bad tag rule is caught", function () {
  var tokenMap = A.loadTokenMap(
    fs.readFileSync(path.join(REPO_ROOT, "tokens", "tokens.css"), "utf8"),
  );
  var facts = {
    "tag-default": A.readAppearance("tag-default", ANATOMY),
    checkbox: A.readAppearance("checkbox", ANATOMY),
  };
  // #123456 is not a tag-default appearance fact color (planted fixture, not
  // the real ds-base.css), so this must red -- proving the gate is not a
  // no-op that would pass any input.
  var badCss = ".ds-tag--pink{background:#123456}";
  var v = F.checkBaseCssRules(badCss, facts, tokenMap);
  assert.ok(
    v.some(function (m) {
      return (
        /^ds-base\.css/.test(m) && /\.ds-tag--pink/.test(m) && /#123456/.test(m)
      );
    }),
    "violation names ds-base.css, the selector, and the bad color, got: " +
      JSON.stringify(v),
  );
});
