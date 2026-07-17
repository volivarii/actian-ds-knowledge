"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var A = require("../../scripts/render/derive-appearance.js");
var tpl = require("../../scripts/render/templates/tag-default.js").template;
var ANATOMY = path.resolve(__dirname, "../../components/dist/anatomy");

// icon-* tokens are gray in the real sheet; use a map that round-trips only the border tokens
var TOKENS = { "--zen-color-primary-50": "#cbe3ff" };

test("tag template: 8 color classes, each background is the fact value", function () {
  var facts = A.readAppearance("tag-default", ANATOMY);
  var out = tpl(facts, { tokenMap: TOKENS });
  assert.match(out.css, /\.ds-tag--indigo\{background:#edf6ff/); // value-first: stale bg token -> hex
  assert.match(out.css, /\.ds-tag--indigo\{[^}]*border-color:var\(--zen-color-primary-50\)/); // border round-trips
  assert.equal((out.css.match(/\.ds-tag--[a-z]+\{/g) || []).length, 8);
  assert.match(out.fragment, /class="ds-tag ds-tag--pink"/);
  assert.equal((out.fragment.match(/ds-tag ds-tag--/g) || []).length, 8);
});
