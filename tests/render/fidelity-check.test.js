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
  // #123456 is not a tag-default appearance fact color, so the gate must name
  // it. Deliberately fabricated rather than a real DS colour: this sentinel was
  // #000000 until the 2026-07-23 capture made that a genuine tag-default fact
  // (the label text), quietly turning the assertion into a no-op. A colour the
  // palette can never adopt cannot go stale.
  var canonical = {
    css: "/* tag-default (derived-from-facts) */\n.ds-tag--pink{background:#123456}\n",
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
    // tag-stage owns the .ds-tag-stage-scoped hue overrides (its Gray, Lime and
    // Orange fills diverged from tag-default's in the 2026-07-23 redesign), so
    // its facts must be in scope or those correct values read as violations.
    "tag-stage": A.readAppearance("tag-stage", ANATOMY),
    checkbox: A.readAppearance("checkbox", ANATOMY),
  };
  var v = F.checkBaseCssRules(dsBaseCss, facts, tokenMap);
  assert.deepEqual(v, []);
  // Non-vacuity: corrupt a REAL multi-line tag rule in ds-base.css and confirm
  // the gate catches it. Guards against a selector-regex regression that would
  // silently match nothing, making the pass above vacuous.
  var corrupted = dsBaseCss.replace(
    "background: #ffd6d8;",
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
  // The borrowed value used to be tag-catalog's #000000 text colour, but the
  // 2026-07-23 capture moved the tag label to #000000 too, so tag-default began
  // owning it legitimately and this assertion stopped discriminating. #fff4ec
  // belongs to exactly one owner in the family and the hue axis has no claim.
  var facts = {
    "tag-default": A.readAppearance("tag-default", ANATOMY),
    "tag-status": A.readAppearance("tag-status", ANATOMY),
    checkbox: A.readAppearance("checkbox", ANATOMY),
  };
  var tokenMap = {};
  var cssText =
    ".ds-tag--bogus { background: #fff4ec; }\n" +
    ".ds-tag--status-error { background: #fff4ec; }\n";
  var v = F.checkBaseCssRules(cssText, facts, tokenMap);
  assert.ok(
    v.some(function (m) {
      return /\.ds-tag--bogus/.test(m) && /#fff4ec/.test(m);
    }),
    "a fabricated .ds-tag--bogus borrowing tag-status's #fff4ec Fail fill " +
      "must still violate (checked against tag-default, which does not " +
      "own #fff4ec), got: " +
      JSON.stringify(v),
  );
  assert.ok(
    !v.some(function (m) {
      return /\.ds-tag--status-error/.test(m);
    }),
    "legitimate .ds-tag--status-error fill must pass (checked against its " +
      "own owning fact source, tag-status), got: " +
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
    "tag-stage": A.readAppearance("tag-stage", ANATOMY),
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

// Task 5: runFidelityReport walks every render slug, classifies every color
// declaration its owned CSS carries, and emits components/render/dist/
// fidelity-report.json. runFidelityReport reads no files of its own beyond
// readAppearance and the fragment markup Amendment 1 needs, so the test
// supplies the same stylesheet, token map, and fragments dir the CLI does.
var CLASSIFY_MOD = require("../../scripts/render/fidelity-classify.js");
var FRAGMENTS_DIR = path.join(REPO_ROOT, "components/render/dist/fragments");
var BASE_CSS = fs.readFileSync(
  path.join(REPO_ROOT, "components/render/renderer/ds-base.css"),
  "utf8",
);
var TOKEN_MAP = A.loadTokenMap(
  fs.readFileSync(path.join(REPO_ROOT, "tokens/tokens.css"), "utf8") +
    "\n" +
    BASE_CSS,
);
function runReport() {
  return F.runFidelityReport({
    anatomyDir: ANATOMY,
    css: BASE_CSS,
    tokenMap: TOKEN_MAP,
    fragmentsDir: FRAGMENTS_DIR,
  });
}

// Amendment 3: the signature grew a fourth required field (fragmentsDir, for
// Amendment 1's per-slug filter) but stays all-required-or-throw, same as the
// original three.
// Finding 5: the guard used to list all four required keys in its message
// regardless of which one was actually absent, so a regex for any ONE key
// matched whichever key was truly missing -- the test was satisfiable by an
// unrelated failure (e.g. it would still pass if the code always blamed the
// wrong key). assertMissingCtxKey names the actually-missing key AND asserts
// the other three keys are absent from the message, so the test can no
// longer pass on a wrong-key report.
var ALL_CTX_KEYS = ["anatomyDir", "css", "tokenMap", "fragmentsDir"];
function assertMissingCtxKey(ctxPartial, missingKey) {
  assert.throws(
    function () {
      F.runFidelityReport(ctxPartial);
    },
    function (err) {
      assert.match(
        err.message,
        new RegExp("\\b" + missingKey + "\\b"),
        "message names the actually-missing key " + missingKey,
      );
      ALL_CTX_KEYS.filter(function (k) {
        return k !== missingKey;
      }).forEach(function (otherKey) {
        assert.doesNotMatch(
          err.message,
          new RegExp("\\b" + otherKey + "\\b"),
          "message must not name an unrelated key (" +
            otherKey +
            "), or this test is satisfiable by a wrong-key report: " +
            err.message,
        );
      });
      return true;
    },
  );
}

test("runFidelityReport requires anatomyDir, css, tokenMap, and fragmentsDir", function () {
  assertMissingCtxKey(
    { css: BASE_CSS, tokenMap: TOKEN_MAP, fragmentsDir: FRAGMENTS_DIR },
    "anatomyDir",
  );
  assertMissingCtxKey(
    { anatomyDir: ANATOMY, tokenMap: TOKEN_MAP, fragmentsDir: FRAGMENTS_DIR },
    "css",
  );
  assertMissingCtxKey(
    { anatomyDir: ANATOMY, css: BASE_CSS, fragmentsDir: FRAGMENTS_DIR },
    "tokenMap",
  );
  assertMissingCtxKey(
    { anatomyDir: ANATOMY, css: BASE_CSS, tokenMap: TOKEN_MAP },
    "fragmentsDir",
  );
});

test("runFidelityReport examines every render slug", function () {
  var report = runReport();
  assert.equal(
    Object.keys(report.bySlug).length,
    MATRIX.RENDER_SLUGS.length,
    "every render slug must appear in the report",
  );
  // The blind spot this work exists to close: the old loop examined zero.
  // A floor of 0 rather than a pinned count, because a hand-maintained number
  // here would be one more fact restated (see the standing rule in Global
  // Constraints). Correctness lives in the unit tests over known inputs.
  // verifiedViaTokenName (review finding 2) is part of the examined/checkable
  // set alongside verified and mismatch: the capture DID speak to those
  // declarations, it just agreed via the token name rather than the hex.
  var examined =
    report.totals.verified +
    report.totals.verifiedViaTokenName +
    report.totals.mismatch +
    report.totals.unverifiable;
  assert.ok(examined > 0, "the classifier examined nothing at all");
  assert.equal(
    examined,
    report.totals.examined,
    "totals.examined disagrees with its buckets",
  );

  // Deliberately NOT asserting every slug classified at least one declaration:
  // `loader-with-logo` owns rules that paint no color at all (verified 2026-07-24),
  // so a blanket per-slug floor would be false. The real failure mode, an
  // ownership entry that reaches no rules, is asserted directly in
  // tests/render/css-owners.test.js instead of inferred here.
});

test("runFidelityReport reports both honest numbers", function () {
  var report = runReport();
  // verifiedViaTokenName (review finding 2) is part of `checkable`: the
  // capture spoke to those declarations and agreed via the token name, so
  // excluding them would shrink checkable/examined under the exact same
  // declarations the report already counted before the split existed.
  var checkable =
    report.totals.verified +
    report.totals.verifiedViaTokenName +
    report.totals.mismatch;
  var total = checkable + report.totals.unverifiable;
  assert.equal(
    report.totals.oracleCoverage,
    Number((checkable / total).toFixed(4)),
  );
  // verifiedFidelity's numerator stays `verified` alone (a direct hex
  // match): a declaration that only agrees via token name is not folded
  // back into the headline "how much is right" number, so a hex divergence
  // a stale token snapshot produced stays visible instead of silently
  // rounding up to 100%.
  assert.equal(
    report.totals.verifiedFidelity,
    Number((report.totals.verified / checkable).toFixed(4)),
  );
  // Both ratios are derived from the buckets, so they are checked for internal
  // consistency rather than against a pinned expected value. A pinned coverage
  // number here would be a hand-maintained fact that goes stale the moment the
  // capture deepens, which is exactly what this work is meant to enable.
  assert.ok(
    report.totals.oracleCoverage >= 0 && report.totals.oracleCoverage <= 1,
    "oracle coverage is a ratio",
  );
  assert.equal(
    report.totals.verified +
      report.totals.verifiedViaTokenName +
      report.totals.mismatch +
      report.totals.unverifiable,
    total,
    "buckets must partition the examined declarations, with no double counting",
  );
});

// Amendment 1: fragment-aware rule attribution. CSS_OWNERS assigns the prefix
// ds-tag to five slugs, so without a per-slug filter every one of them is
// charged for every .ds-tag* rule in ds-base.css, including tag-stage's dot
// rules and the grouped tag-status rules that the OTHER family members never
// render at all.
test("fragmentClasses reads the full ds-* class tokens a fragment emits", function () {
  var html =
    '<span class="ds-tag ds-tag--catalog"><span class="ds-tag__icon">x</span></span>';
  var got = F.fragmentClasses(html);
  assert.ok(got.has("ds-tag"));
  assert.ok(got.has("ds-tag--catalog"));
  assert.ok(got.has("ds-tag__icon"));
  assert.equal(
    got.size,
    3,
    "only the three real ds-* tokens, nothing invented",
  );
});

test("filterCssForFragment drops a rule referencing any class the fragment does not emit, keeps rules whose classes are all emitted (shared prefix)", function () {
  var css =
    ".ds-tag { color: red; }\n" +
    ".ds-tag--pink { color: pink; }\n" +
    ".ds-tag--catalog { color: blue; }\n" +
    ".ds-tag--indigo .ds-tag-stage__dot { color: green; }\n";
  var emitted = new Set(["ds-tag", "ds-tag--catalog", "ds-tag__icon"]);
  // ds-tag is a shared prefix (multiple owners), so the fragment-emitted-class
  // test applies.
  var shared = { "ds-tag": ["tag-catalog", "tag-default"] };
  var filtered = F.filterCssForFragment(css, emitted, ["ds-tag"], shared);
  assert.match(filtered, /\.ds-tag\s*\{/);
  assert.match(filtered, /\.ds-tag--catalog\s*\{/);
  assert.doesNotMatch(
    filtered,
    /\.ds-tag--pink/,
    "a rule naming an unemitted class must be dropped entirely",
  );
  assert.doesNotMatch(
    filtered,
    /ds-tag-stage__dot/,
    "a descendant rule is dropped when EITHER of its classes is unemitted",
  );
});

test("filterCssForFragment keeps a rule whose selector carries a pseudo-class, not a class token (shared prefix)", function () {
  // .ds-link:hover references only ds-link -- the pseudo-class is not itself
  // a class token and must not cause a drop. ds-link is shared here so the
  // fragment-emitted-class test is actually exercised.
  var css = ".ds-link:hover { color: blue; }\n.ds-link { color: black; }\n";
  var emitted = new Set(["ds-link"]);
  var shared = { "ds-link": ["a", "b"] };
  var filtered = F.filterCssForFragment(css, emitted, ["ds-link"], shared);
  assert.match(filtered, /\.ds-link:hover/);
  assert.match(filtered, /\.ds-link\s*\{/);
});

// The narrowing this task makes: the fragment-emitted-class test must apply
// ONLY when the rule's owning prefix is shared by more than one slug. A
// single-owner prefix carries no cross-slug ambiguity, so its rules are the
// component's own -- even a variant the curated fragment specimen never
// happens to render -- and must be kept, not dropped.
test("filterCssForFragment keeps a rule under a single-owner prefix even when the fragment never emits its class (this is the case that would fail against a universal filter)", function () {
  var css =
    ".ds-button { color: black; }\n" +
    ".ds-button__icon { color: red; }\n" +
    ".ds-button--small { color: blue; }\n";
  // The fragment only ever emits the root class -- never the icon element or
  // the --small modifier -- but ds-button has exactly one owner (button), so
  // neither rule is ambiguous and both must survive the filter.
  var emitted = new Set(["ds-button"]);
  var shared = { "ds-button": ["button"] };
  var filtered = F.filterCssForFragment(css, emitted, ["ds-button"], shared);
  assert.match(
    filtered,
    /\.ds-button__icon\s*\{/,
    "a single-owner prefix's own BEM element must be kept even when the " +
      "fragment specimen never renders it",
  );
  assert.match(
    filtered,
    /\.ds-button--small\s*\{/,
    "a single-owner prefix's own unrendered variant must be kept, not " +
      "dropped as if it were a cross-slug misattribution",
  );
});

// A prefix shared by more than one slug still filters normally alongside a
// single-owner prefix in the same stylesheet -- the gate is per-rule, keyed
// off each rule's OWN owning prefix, not an all-or-nothing switch for the
// whole filter call.
test("filterCssForFragment applies the fragment test to a shared prefix's rules while keeping a single-owner prefix's rules unconditionally, in the same call", function () {
  var css =
    ".ds-tag--pink { color: pink; }\n" + ".ds-button__icon { color: red; }\n";
  var emitted = new Set([]);
  var prefixes = ["ds-tag", "ds-button"];
  var shared = {
    "ds-tag": ["tag-catalog", "tag-default"],
    "ds-button": ["button"],
  };
  var filtered = F.filterCssForFragment(css, emitted, prefixes, shared);
  assert.doesNotMatch(
    filtered,
    /\.ds-tag--pink/,
    "ds-tag is shared, so an unemitted class still drops its rule",
  );
  assert.match(
    filtered,
    /\.ds-button__icon/,
    "ds-button has a single owner, so its rule survives regardless of emitted classes",
  );
});

test("fragment-aware filtering: tag-catalog is charged only for the ds-base.css rules its fragment can trigger", function () {
  var html = fs.readFileSync(
    path.join(FRAGMENTS_DIR, "tag-catalog.html"),
    "utf8",
  );
  var emitted = F.fragmentClasses(html);
  var filtered = F.filterCssForFragment(
    BASE_CSS,
    emitted,
    ["ds-tag"],
    F.sharedPrefixMap(),
  );
  var rules = CLASSIFY_MOD.ownedRules(filtered, ["ds-tag"]);
  var selectors = rules
    .map(function (r) {
      return r.selector;
    })
    .sort();
  assert.deepEqual(
    selectors,
    [".ds-tag", ".ds-tag--catalog", ".ds-tag__icon", ".ds-tag__icon svg"],
    "tag-catalog must not be charged with tag-stage's dot rules, the grouped " +
      "tag-status rules, or any other family member's color modifiers, got: " +
      JSON.stringify(selectors),
  );
});

function runReportWithCss(css) {
  return F.runFidelityReport({
    anatomyDir: ANATOMY,
    css: css,
    tokenMap: TOKEN_MAP,
    fragmentsDir: FRAGMENTS_DIR,
  });
}

function mismatchesFor(report, slug) {
  return report.mismatches.filter(function (m) {
    return m.slug === slug;
  });
}

// The brief evaluated and rejected de-duplicating declarations across slugs: a
// single shared .ds-tag--<color> rule is checked once per family member,
// against THAT member's own capture, so a genuine cross-capture contradiction
// stays visible instead of being collapsed. Task 6 resolved the one real
// contradiction (tag-stage's Orange/Yellow borders, now carried by its own
// .ds-tag-stage--<color> rules), so the property is proved by planting a value
// that is wrong for BOTH captures and asserting BOTH slugs report it.
// The specimen is DERIVED, never hardcoded. An earlier version pinned
// `border-color: var(--zen-color-primary-50)` on .ds-tag--indigo; the
// 2026-07-23 tag redesign retired tag borders outright and the test failed for
// a reason that had nothing to do with the property it guards. A hand-picked
// specimen is a copy of a fact the stylesheet already owns, and it goes stale
// the first time the design moves.
function firstSharedTagColorDecl(css) {
  var re = /(\.ds-tag--([a-z0-9-]+))\s*\{([^}]*)\}/g;
  var m;
  while ((m = re.exec(css)) !== null) {
    // Skip a colour a family member overrides with its own scoped rule: the
    // cascade correctly files the shared declaration as `overridden` for that
    // member, so it is genuinely not charged there and proves nothing about
    // de-duplication. Only an un-overridden shared colour tests the property.
    if (new RegExp("\\.ds-tag-[a-z]+--" + m[2] + "\\s*\\{").test(css)) continue;
    var d = /(background|background-color|color|border-color)\s*:\s*([^;]+);/.exec(m[3]);
    if (d && css.split(d[0]).length - 1 === 1) {
      return { selector: m[1], decl: d[0], prop: d[1] };
    }
  }
  return null;
}

test("fragment-aware filtering does not deduplicate a rule across slugs: one shared .ds-tag rule is charged to every family member that renders it", function () {
  var spec = firstSharedTagColorDecl(BASE_CSS);
  assert.ok(spec, "no uniquely-locatable shared .ds-tag--<color> color declaration found");
  // #123456 is not an appearance fact color of any tag family member.
  var corrupted = BASE_CSS.replace(spec.decl, spec.prop + ": #123456;");
  var report = runReportWithCss(corrupted);
  var charged = ["tag-default", "tag-stage"].filter(function (slug) {
    return mismatchesFor(report, slug).some(function (m) {
      return m.selector.indexOf(spec.selector) !== -1 && /#123456/.test(m.message);
    });
  });
  assert.ok(
    charged.length >= 2,
    "a shared " + spec.selector + " declaration must be charged to every family " +
      "member whose fragment renders it, not collapsed to one; charged: " +
      JSON.stringify(charged),
  );
});

// The other half of the same property: a rule scoped to ONE member's own
// prefix belongs to that member alone. .ds-tag-stage--orange exists because
// Figma gives tag-stage a different Orange border than tag-default, so
// corrupting it must red tag-stage and leave tag-default untouched.
test("a tag-stage-scoped color rule is charged to tag-stage alone, not to the shared tag family", function () {
  // Derived from what the gate actually VERIFIES today, not from CSS text. An
  // earlier version scanned the stylesheet and picked the first uniquely
  // locatable .ds-tag-stage--<colour> declaration, which selected gray: gray is
  // tag-stage's own root variant, so a modifier rule for it matches no variant
  // fact and is honestly unverifiable. Corrupting an unverifiable declaration
  // proves nothing. Selecting a verified one guarantees the corruption has a
  // subject to contradict.
  var baseline = runReport();
  var verifiedStageRule = null;
  var re = /(\.ds-tag-stage--[a-z0-9-]+)\s*\{([^}]*)\}/g;
  var m;
  while (verifiedStageRule === null && (m = re.exec(BASE_CSS)) !== null) {
    var d = /(background|background-color|color|border-color)\s*:\s*([^;]+);/.exec(m[2]);
    if (!d || BASE_CSS.split(d[0]).length - 1 !== 1) continue;
    // Only a selector the gate can currently reach for tag-stage qualifies.
    var probe = runReportWithCss(BASE_CSS.replace(d[0], d[1] + ": #123456;"));
    if (
      mismatchesFor(probe, "tag-stage").some(function (x) {
        return x.selector.indexOf(m[1]) !== -1;
      })
    ) {
      verifiedStageRule = { selector: m[1], decl: d[0], prop: d[1] };
    }
  }
  var spec = verifiedStageRule;
  assert.ok(
    spec,
    "no .ds-tag-stage--<color> declaration is currently reachable by the gate " +
      "for tag-stage, so this property cannot be tested; baseline verified: " +
      baseline.bySlug["tag-stage"].verified,
  );
  var corrupted = BASE_CSS.replace(spec.decl, spec.prop + ": #123456;");
  var report = runReportWithCss(corrupted);
  assert.ok(
    mismatchesFor(report, "tag-stage").some(function (m) {
      return m.selector.indexOf(spec.selector) !== -1;
    }),
    "tag-stage must be charged for its own scoped rule, got: " +
      JSON.stringify(mismatchesFor(report, "tag-stage")),
  );
  assert.deepEqual(
    mismatchesFor(report, "tag-default"),
    [],
    "tag-default must not be charged for a rule scoped to tag-stage's prefix",
  );
});

// Amendment 2: a report that lists a blind slug beside a verified one with no
// distinction is a false all-clear. See
// feedback_gate_must_assert_its_subject_was_present.
test("runFidelityReport reports blind slugs explicitly, not as an inferred zero", function () {
  var report = runReport();
  assert.ok(Array.isArray(report.blind), "the report must carry a blind list");
  assert.ok(
    report.blind.indexOf("loader-with-logo") !== -1,
    "loader-with-logo owns rules that paint no color at all (verified 2026-07-24), " +
      "so it must be reported blind, not silently indistinguishable from a verified slug",
  );
  report.blind.forEach(function (slug) {
    assert.equal(report.bySlug[slug].verified, 0);
    assert.equal(report.bySlug[slug].mismatch, 0);
    // Review finding 2: verifiedViaTokenName is a real positive signal too
    // (the capture spoke and agreed), so a genuinely blind slug must also
    // carry zero of it -- otherwise a slug like badge (0 verified, 0
    // mismatch, 1 verifiedViaTokenName) would misread as blind.
    assert.equal(report.bySlug[slug].verifiedViaTokenName, 0);
    // Finding 1: a blind slug must be self-marking on its own bySlug row, not
    // only present in the sibling top-level array -- a consumer filtering
    // bySlug directly (e.g. for mismatch === 0) must not have to remember to
    // join the top-level list to know the row is blind.
    assert.equal(
      report.bySlug[slug].blind,
      true,
      slug + ": a blind slug's own bySlug row must carry blind:true",
    );
  });
  Object.keys(report.bySlug).forEach(function (slug) {
    var b = report.bySlug[slug];
    var isBlind =
      b.verified === 0 && b.mismatch === 0 && b.verifiedViaTokenName === 0;
    assert.equal(
      report.blind.indexOf(slug) !== -1,
      isBlind,
      slug +
        ": blind-list membership disagrees with its own verified/mismatch/verifiedViaTokenName counts",
    );
    assert.equal(
      b.blind,
      isBlind,
      slug +
        ": the bySlug row's own blind field disagrees with its verified/mismatch/verifiedViaTokenName counts",
    );
  });
  // Non-vacuity: badge is exactly the case this guard exists for -- zero
  // verified, zero mismatch, but a real verifiedViaTokenName signal, so it
  // must NOT be blind.
  assert.equal(
    report.bySlug.badge.verified,
    0,
    "badge's one declaration verifies via token-name agreement, not a direct hex match",
  );
  assert.equal(report.bySlug.badge.verifiedViaTokenName, 1);
  assert.equal(
    report.bySlug.badge.blind,
    false,
    "badge must not read as blind: the capture spoke to it and agreed",
  );
  assert.equal(report.blind.indexOf("badge"), -1);
});

test("the emitted report is stamped and deterministic", function () {
  var p = path.join(REPO_ROOT, "components/render/dist/fidelity-report.json");
  var json = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(json._meta.auto_generated, true);
  assert.equal(json._meta.source, "scripts/render/fidelity-check.js");
  assert.ok(json._meta.do_not_edit);
  // bySlug keys sorted, so the dist cannot shift with iteration order.
  var keys = Object.keys(json.bySlug);
  assert.deepEqual(keys, keys.slice().sort());
  assert.ok(
    Array.isArray(json.blind),
    "the dist report must carry the blind list",
  );
  // Finding 1: every persisted bySlug row must carry an explicit boolean
  // blind field, consistent with membership in the top-level blind array --
  // a blind row (e.g. loader-with-logo) must not be indistinguishable from a
  // genuinely clean, fully-verified row.
  keys.forEach(function (slug) {
    assert.equal(
      typeof json.bySlug[slug].blind,
      "boolean",
      slug + ": bySlug row must carry an explicit boolean blind field",
    );
    assert.equal(
      json.bySlug[slug].blind,
      json.blind.indexOf(slug) !== -1,
      slug +
        ": bySlug row's blind field disagrees with the top-level blind list",
    );
  });
});

// Task 6: the gate blocks. Every candidate mismatch was triaged (four real
// token-binding defects in ds-base.css, two classifier bugs producing false
// mismatches), so a mismatch from here on is a regression and must red.
test("no unresolved fidelity mismatches remain", function () {
  var report = runReport();
  assert.deepEqual(
    report.mismatches.map(function (m) {
      return m.message;
    }),
    [],
    "a render paints a color the capture contradicts",
  );
});

// Non-vacuity for the assertion above. An empty mismatch list is only evidence
// of correctness if the pipeline that produced it CAN produce a non-empty one
// from this same corpus. Planting a wrong token on a rule that verifies today
// proves it end to end, through the real fragments, real captures, and real
// filtering -- not through a synthetic fixture.
test("the zero-mismatch result is not vacuous: a wrong token on a verifying rule is reported", function () {
  var target = "background: var(--zen-color-error-700);";
  assert.equal(
    BASE_CSS.split(target).length - 1,
    1,
    "the .ds-button--critical background declaration was located exactly once",
  );
  var report = runReportWithCss(
    BASE_CSS.replace(target, "background: var(--zen-color-bg-subtle);"),
  );
  assert.ok(
    mismatchesFor(report, "button").some(function (m) {
      return /ds-button--critical/.test(m.selector);
    }),
    "a wrong token on .ds-button--critical must be reported, got: " +
      JSON.stringify(report.mismatches),
  );
});

// The failure text is what a future engineer acts on, so its content is
// asserted rather than assumed. The two resolutions it names are the only two
// there are, and an ignore list is not one of them.
test("mismatchFailureMessage names every mismatch and both real resolutions, and rules out an ignore list", function () {
  var msg = F.mismatchFailureMessage([
    {
      message:
        "widget .ds-widget {background}: paints #000000 but the capture says #ffffff",
    },
    {
      message:
        "gadget .ds-gadget {border}: paints #111111 but the capture says #222222",
    },
  ]);
  assert.match(msg, /FIDELITY MISMATCHES \(2\)/);
  assert.match(msg, /\.ds-widget \{background\}/);
  assert.match(msg, /\.ds-gadget \{border\}/);
  assert.match(msg, /ds-base\.css/, "names where to fix a real defect");
  assert.match(
    msg,
    /fidelity-classify\.test\.js/,
    "names where to pin a classifier gap",
  );
  assert.match(msg, /ignore list is NOT an option/i);
  assert.doesNotMatch(
    msg,
    /task 6/i,
    "the shipped message must not reference an internal plan task",
  );
});

test("CLI: fidelity-check.js prints the blind count and blocks when a mismatch appears", function () {
  var child_process = require("node:child_process");
  var result = child_process.spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts/render/fidelity-check.js")],
    { encoding: "utf8" },
  );
  assert.equal(
    result.status,
    0,
    "the corpus carries no mismatches, so the gate must pass: " +
      result.stdout +
      result.stderr,
  );
  assert.match(
    result.stdout,
    /blind/i,
    "the CLI summary must print the blind count",
  );
  // A green exit proves nothing on its own -- it would look identical if the
  // gate had been wired to never fail. The exit code is a pure function of the
  // mismatch list, so asserting the reported list is empty AND that a non-empty
  // list produces a failure message is what makes the green meaningful.
  assert.match(
    result.stdout,
    /mismatch: {5}0/,
    "the summary must show the mismatch count it is gating on: " +
      result.stdout,
  );
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /not blocking/i,
    "the non-blocking wording is retired",
  );
});
