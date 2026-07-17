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
  out.css = out.css.replace(/\.ds-tag--pink\{background:#[0-9a-fA-F]+/, ".ds-tag--pink{background:#000000");
  var v = F.fidelityCheck(out, { anatomyDir: ANATOMY, tokenMap: tokenMap });
  assert.ok(v.some(function (m) { return /tag-default/.test(m) && /pink/.test(m); }), "violation names the bad color");
});
