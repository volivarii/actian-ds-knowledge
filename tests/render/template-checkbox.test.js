"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var A = require("../../scripts/render/derive-appearance.js");
var tpl = require("../../scripts/render/templates/checkbox.js").template;
var ANATOMY = path.resolve(__dirname, "../../components/dist/anatomy");

test("checkbox template: 4 state cells with correct classes + indeterminate rule", function () {
  var facts = A.readAppearance("checkbox", ANATOMY);
  var out = tpl(facts, { tokenMap: {} });
  assert.match(out.fragment, /class="ds-checkbox"/);                 // unchecked
  assert.match(out.fragment, /class="ds-checkbox ds-checkbox--checked"/);
  assert.match(out.fragment, /class="ds-checkbox ds-checkbox--indeterminate"/);
  assert.match(out.fragment, /class="ds-checkbox is-disabled"/);
  assert.match(out.css, /ds-checkbox--indeterminate .ds-checkbox__box\{[^}]*var\(--zen-color-icon-primary\)/);
  assert.match(out.css, /ds-checkbox--indeterminate .ds-checkbox__check\{display:block\}/);
});

test("checkbox template: facts confirm the checked treatment is icon-primary", function () {
  var facts = A.readAppearance("checkbox", ANATOMY);
  var checkedBlue = facts.variants.find(function (v) {
    return v.prop === "Selection" && (v.values || []).indexOf("Checked") >= 0 && v.background;
  });
  assert.ok(checkedBlue, "a Selection=Checked appearance fact exists");
  assert.equal(checkedBlue.backgroundToken, "--zen-color-icon-primary");
});
