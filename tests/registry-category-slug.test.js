"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var transform = require("../scripts/transformers/transform-registry.js");

test("buildEntry emits categorySlug = slugify(category)", function () {
  // The fixture used to be "Form (input & selection)", a category retired in
  // #534. It kept passing, because this test only ever exercised the slugify
  // function, never that its output resolves to anything. That is why the rename
  // to "Form" could publish `form` for 19 components while the only defaults
  // file still declared `form-input-selection`, with every gate green. The
  // resolution half now lives in tests/categories-derive.test.js.
  var entry = transform._buildEntry(
    { name: "Toggle", key: "k1", node_id: "1:1" },
    { document: {} },
    "set",
    { section: "Components", category: "Breakpoint, grid & structure" },
    "toggle",
  );
  assert.equal(entry.categorySlug, "breakpoint-grid-structure");
});

test("buildEntry categorySlug handles a plain label", function () {
  var entry = transform._buildEntry(
    { name: "Table", key: "k2", node_id: "2:2" },
    { document: {} },
    "set",
    { section: "Components", category: "Data Display" },
    "table",
  );
  assert.equal(entry.categorySlug, "data-display");
});

test("buildEntry omits categorySlug when there is no category", function () {
  var entry = transform._buildEntry(
    { name: "X", key: "k3", node_id: "3:3" },
    { document: {} },
    "single",
    null,
    "x",
  );
  assert.equal(entry.categorySlug, undefined);
});
