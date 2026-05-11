"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var parser = require(
  path.join(
    __dirname,
    "..",
    "scripts",
    "transformers",
    "component-status-emoji.js",
  ),
);
var extractStatus = parser.extractStatus;

test("component-status-emoji — ✅ returns null status + clean name", function () {
  var r = extractStatus("✅ Calendar");
  assert.equal(r.status, null);
  assert.equal(r.cleanName, "Calendar");
});

test("component-status-emoji — ✍️ → in-progress", function () {
  var r = extractStatus("✍️ Button");
  assert.equal(r.status, "in-progress");
  assert.equal(r.cleanName, "Button");
});

test("component-status-emoji — ⛔️ → deprecated", function () {
  var r = extractStatus("⛔️ Popover");
  assert.equal(r.status, "deprecated");
  assert.equal(r.cleanName, "Popover");
});

test("component-status-emoji — ⚠️ → warn", function () {
  var r = extractStatus("⚠️ Tooltip");
  assert.equal(r.status, "warn");
  assert.equal(r.cleanName, "Tooltip");
});

test("component-status-emoji — plain name (no emoji) returns null + trimmed", function () {
  var r = extractStatus("Plain name");
  assert.equal(r.status, null);
  assert.equal(r.cleanName, "Plain name");
});

test("component-status-emoji — leading whitespace + double-space tolerated", function () {
  var r = extractStatus("     ✍️  Side nav");
  assert.equal(r.status, "in-progress");
  assert.equal(r.cleanName, "Side nav");
});

test("component-status-emoji — unrecognized leading char preserves raw trimmed", function () {
  var r = extractStatus("✏️ Unknown emoji");
  assert.equal(r.status, null);
  assert.equal(r.cleanName, "✏️ Unknown emoji");
});

test("component-status-emoji — exports COMPONENT_STATUS_MAP", function () {
  assert.equal(typeof parser.COMPONENT_STATUS_MAP, "object");
  assert.equal(parser.COMPONENT_STATUS_MAP["✅"], null);
  assert.equal(parser.COMPONENT_STATUS_MAP["✍️"], "in-progress");
  assert.equal(parser.COMPONENT_STATUS_MAP["⛔️"], "deprecated");
  assert.equal(parser.COMPONENT_STATUS_MAP["⚠️"], "warn");
});

test("component-status-emoji — null input returns null status + empty cleanName", function () {
  var r = extractStatus(null);
  assert.equal(r.status, null);
  assert.equal(r.cleanName, "");
});

test("component-status-emoji — undefined input returns null status + empty cleanName", function () {
  var r = extractStatus(undefined);
  assert.equal(r.status, null);
  assert.equal(r.cleanName, "");
});
