"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var transform = require("../scripts/transformers/transform-registry.js");

test("buildEntry emits categorySlug = slugify(category)", function () {
  var entry = transform._buildEntry(
    { name: "Toggle", key: "k1", node_id: "1:1" },
    { document: {} },
    "set",
    { section: "Components", category: "Form (input & selection)" },
    "toggle",
  );
  assert.equal(entry.categorySlug, "form-input-selection");
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
