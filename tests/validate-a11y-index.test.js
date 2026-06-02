"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var { run } = require("../scripts/validate/validate-a11y-index.js");

test("accessibility a11y-index.json validates clean against its schema", function () {
  var r = run();
  assert.equal(r.invalid, 0, "violations: " + JSON.stringify(r.records, null, 2));
});
