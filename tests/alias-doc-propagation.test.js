"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var derive = require("../scripts/components/derive-guidelines.js");

// Direct unit test of buildAliasDoc — guards against the regression where the
// alias builder enumerated a fixed field list and silently dropped any field
// added later to canonical docs (updated_at, etc).
test("buildAliasDoc propagates updated_at + future top-level fields", function () {
  var canonical = {
    _schema_version: 1,
    _meta: {
      auto_generated: true,
      source: "components/src/checkbox/",
      do_not_edit: "x",
    },
    slug: "checkbox",
    component: "Checkbox",
    meta: { category: "form-input-selection" },
    updated_at: "2026-05-19T10:00:00+00:00",
    domains: { content: { status: "approved" } },
  };
  var alias = derive.buildAliasDoc(canonical);
  assert.equal(alias._alias_of, "checkbox");
  assert.equal(alias.updated_at, canonical.updated_at);
  assert.equal(alias.component, canonical.component); // sanity: existing fields preserved
});
