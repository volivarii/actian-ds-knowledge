"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var { run } = require("../scripts/validate/validate-a11y-sections.js");

test("accessibility per-section dist validates clean against section.json", function () {
  var r = run();
  assert.equal(r.invalid, 0, "violations: " + JSON.stringify(r.records, null, 2));
});
