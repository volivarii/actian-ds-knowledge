"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var D = require("../../scripts/render/derive-canonical.js");
var F = require("../../scripts/render/fidelity-check.js");
var A = require("../../scripts/render/derive-appearance.js");
var SRC = path.resolve(__dirname, "../../components/render/src");
var ANATOMY = path.resolve(__dirname, "../../components/dist/anatomy");
var REPO_ROOT = path.resolve(__dirname, "../..");

test("fidelityCheck: real derive has no violations", function () {
  var out = D.deriveCanonical(SRC);
  var tokenMap = A.loadTokenMap(out.css);
  var v = F.fidelityCheck(out, { anatomyDir: ANATOMY, tokenMap: tokenMap });
  assert.deepEqual(v, []);
});

test("fidelityCheck: a wrong derived color is caught", function () {
  var out = D.deriveCanonical(SRC);
  var tokenMap = A.loadTokenMap(out.css);
  // corrupt a derived tag color to a value no fact carries
  out.css = out.css.replace(
    /\.ds-tag--pink\{background:#[0-9a-fA-F]+/,
    ".ds-tag--pink{background:#000000",
  );
  var v = F.fidelityCheck(out, { anatomyDir: ANATOMY, tokenMap: tokenMap });
  assert.ok(
    v.some(function (m) {
      return /tag-default/.test(m) && /pink/.test(m);
    }),
    "violation names the bad color",
  );
});

test("fidelityCheck: an empty derived CSS block cannot pass silently", function () {
  var out = D.deriveCanonical(SRC);
  var tokenMap = A.loadTokenMap(out.css);
  // Strip checkbox's entire derived-from-facts appendix block (marker + body)
  // while leaving its manifest entry stamped source:"derived" -- the gate has
  // nothing left to verify and must NOT pass silently.
  var re =
    /\/\* checkbox \(derived-from-facts\) \*\/[\s\S]*?(?=\/\* [a-z-]+ \(derived-from-facts\)|$)/;
  assert.match(out.css, re, "checkbox derived block present before stripping");
  out.css = out.css.replace(re, "");
  var v = F.fidelityCheck(out, { anatomyDir: ANATOMY, tokenMap: tokenMap });
  assert.ok(
    v.some(function (m) {
      return /^checkbox:/.test(m) && /no derived-from-facts CSS block/.test(m);
    }),
    "violation names checkbox and the missing block, got: " + JSON.stringify(v),
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
