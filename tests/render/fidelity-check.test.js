"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var D = require("../../scripts/render/derive-canonical.js");
var F = require("../../scripts/render/fidelity-check.js");
var A = require("../../scripts/render/derive-appearance.js");
var SRC = path.resolve(__dirname, "../../components/render/src");
var ANATOMY = path.resolve(__dirname, "../../components/dist/anatomy");

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
