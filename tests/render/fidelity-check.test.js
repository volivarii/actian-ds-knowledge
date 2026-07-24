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
test("runFidelityReport requires anatomyDir, css, tokenMap, and fragmentsDir", function () {
  assert.throws(function () {
    F.runFidelityReport({
      css: BASE_CSS,
      tokenMap: TOKEN_MAP,
      fragmentsDir: FRAGMENTS_DIR,
    });
  }, /anatomyDir/);
  assert.throws(function () {
    F.runFidelityReport({
      anatomyDir: ANATOMY,
      tokenMap: TOKEN_MAP,
      fragmentsDir: FRAGMENTS_DIR,
    });
  }, /css/);
  assert.throws(function () {
    F.runFidelityReport({
      anatomyDir: ANATOMY,
      css: BASE_CSS,
      fragmentsDir: FRAGMENTS_DIR,
    });
  }, /tokenMap/);
  assert.throws(function () {
    F.runFidelityReport({
      anatomyDir: ANATOMY,
      css: BASE_CSS,
      tokenMap: TOKEN_MAP,
    });
  }, /fragmentsDir/);
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
  var examined =
    report.totals.verified +
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
  var checkable = report.totals.verified + report.totals.mismatch;
  var total = checkable + report.totals.unverifiable;
  assert.equal(
    report.totals.oracleCoverage,
    Number((checkable / total).toFixed(4)),
  );
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

test("filterCssForFragment drops a rule referencing any class the fragment does not emit, keeps rules whose classes are all emitted", function () {
  var css =
    ".ds-tag { color: red; }\n" +
    ".ds-tag--pink { color: pink; }\n" +
    ".ds-tag--catalog { color: blue; }\n" +
    ".ds-tag--indigo .ds-tag-stage__dot { color: green; }\n";
  var emitted = new Set(["ds-tag", "ds-tag--catalog", "ds-tag__icon"]);
  var filtered = F.filterCssForFragment(css, emitted);
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

test("filterCssForFragment keeps a rule whose selector carries a pseudo-class, not a class token", function () {
  // .ds-link:hover references only ds-link -- the pseudo-class is not itself
  // a class token and must not cause a drop.
  var css = ".ds-link:hover { color: blue; }\n.ds-link { color: black; }\n";
  var emitted = new Set(["ds-link"]);
  var filtered = F.filterCssForFragment(css, emitted);
  assert.match(filtered, /\.ds-link:hover/);
  assert.match(filtered, /\.ds-link\s*\{/);
});

test("fragment-aware filtering: tag-catalog is charged only for the ds-base.css rules its fragment can trigger", function () {
  var html = fs.readFileSync(
    path.join(FRAGMENTS_DIR, "tag-catalog.html"),
    "utf8",
  );
  var emitted = F.fragmentClasses(html);
  var filtered = F.filterCssForFragment(BASE_CSS, emitted);
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

// The brief evaluated and rejected de-duplicating declarations across slugs:
// tag-default legitimately verifies the SAME .ds-tag--orange/--yellow
// border-color rule that tag-stage's own capture disagrees with. Fragment
// filtering must not collapse that real cross-capture contradiction.
test("fragment-aware filtering does not deduplicate a rule across slugs: tag-default verifies while tag-stage's own capture disagrees on the identical rule", function () {
  var report = runReport();
  assert.ok(
    report.bySlug["tag-default"].verified > 0,
    "tag-default must still verify its owned color modifiers",
  );
  var stageMismatches = report.mismatches.filter(function (m) {
    return m.slug === "tag-stage" && /orange|yellow/.test(m.selector);
  });
  assert.ok(
    stageMismatches.length >= 2,
    "tag-stage's orange/yellow border-color mismatches must stay visible even " +
      "though tag-default verifies the identical CSS rule, got: " +
      JSON.stringify(
        report.mismatches.filter(function (m) {
          return m.slug === "tag-stage";
        }),
      ),
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
  });
  Object.keys(report.bySlug).forEach(function (slug) {
    var b = report.bySlug[slug];
    var isBlind = b.verified === 0 && b.mismatch === 0;
    assert.equal(
      report.blind.indexOf(slug) !== -1,
      isBlind,
      slug +
        ": blind-list membership disagrees with its own verified/mismatch counts",
    );
  });
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
});

test("CLI: fidelity-check.js prints the blind count and does not fail the build on mismatches", function () {
  var child_process = require("node:child_process");
  var result = child_process.spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts/render/fidelity-check.js")],
    { encoding: "utf8" },
  );
  assert.equal(
    result.status,
    0,
    "the report lands non-blocking (Task 6 triages mismatches before flipping " +
      "the gate), so mismatches printing must not fail the process: " +
      result.stdout +
      result.stderr,
  );
  assert.match(
    result.stdout,
    /blind/i,
    "the CLI summary must print the blind count",
  );
});
