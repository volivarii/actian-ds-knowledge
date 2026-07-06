// tests/sync-token-names.test.js
// P2 name layer: key-based join from Figma local variable ids to PUBLISHED
// --zen-* custom property names. The whole design goal is "no name guessing":
// a name only rides when (a) the id resolves to a stable library key via the
// committed plugin export, (b) the key maps to a DTCG token path via the same
// bindings the tokens generator consumes, and (c) the mechanically derived
// CSS var name EXISTS in tokens.css with a value whose type fits the slot.
// Any miss anywhere degrades to value-only capture, never a wrong name.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var T = require("../scripts/sync/token-names");

var BINDINGS_RAW = {
  variables: [
    {
      name: "white",
      key: "KW",
      variableCollectionName: "Zen colors",
      variableType: "COLOR",
    },
    {
      name: "royal-blue/500",
      key: "KRB",
      variableCollectionName: "Zen colors",
      variableType: "COLOR",
    },
    {
      name: "primary/500",
      key: "KP",
      variableCollectionName: "Global colors",
      variableType: "COLOR",
    },
    {
      name: "Spacing/spacing-xs",
      key: "KS",
      variableCollectionName: "Spacing",
      variableType: "FLOAT",
    },
    {
      name: "border-radius-sm",
      key: "KR",
      variableCollectionName: "Borders",
      variableType: "FLOAT",
    },
    {
      name: "color-icon-default",
      key: "KI",
      variableCollectionName: "Icon",
      variableType: "COLOR",
    },
    {
      name: "color-text-secondary",
      key: "KT",
      variableCollectionName: "Font / Text",
      variableType: "COLOR",
    },
    {
      name: "color-bg-selected",
      key: "KBG",
      variableCollectionName: "Global colors",
      variableType: "COLOR",
    },
    // No color-valued --zen-color-border-* is published; must be dropped by
    // the existence gate (NOT mapped onto the composite --zen-border-error).
    {
      name: "color-border-error",
      key: "KB",
      variableCollectionName: "Borders",
      variableType: "COLOR",
    },
    // Composite css var ("1px solid ..."): exists, but is neither a color
    // nor a length — usable as a generic ref name, never for a color/length slot.
    {
      name: "border-default",
      key: "KBD",
      variableCollectionName: "Borders",
      variableType: "FLOAT",
    },
  ],
};

var TOKENS_CSS = [
  ":root,",
  "[data-theme=actian] {",
  "  --zen-color-white: #ffffff;",
  "  --zen-color-royal-blue-500: #0f5fdc;",
  "  --zen-color-primary-500: #0f5fdc;",
  "  --zen-color-bg-selected: #f3f5f9;",
  "  --zen-spacing-xs: 8px;",
  "  --zen-border-radius-sm: 6px;",
  "  --zen-color-icon-default: #000000;",
  "  --zen-color-text-secondary: #40404a;",
  "  --zen-border-default: 1px solid #e1e1e6;",
  "}",
  "[data-theme=studio] {",
  "  --zen-color-primary-500: #0283be;",
  "}",
].join("\n");

var IDS_EXPORT = {
  ids: {
    "VariableID:1:1": { key: "KW", name: "white", resolvedType: "COLOR" },
    "VariableID:1:2": { key: "KS" },
    "VariableID:1:3": { key: "KR" },
    "VariableID:1:4": { key: "KI" },
    "VariableID:1:5": { key: "KB" },
    "VariableID:1:6": { key: "KBD" },
    "VariableID:1:7": { key: "KRB" },
    "VariableID:1:8": { key: "KBG" },
    "VariableID:1:9": { key: "KEY_NOT_IN_BINDINGS" },
  },
};

function maps() {
  return T.buildTokenNameMaps({
    idsExport: IDS_EXPORT,
    bindingsRaw: BINDINGS_RAW,
    tokensCssText: TOKENS_CSS,
  });
}

test("color variables land in colorNameById and varNameById", function () {
  var m = maps();
  assert.equal(m.colorNameById["VariableID:1:1"], "--zen-color-white");
  assert.equal(m.varNameById["VariableID:1:1"], "--zen-color-white");
  assert.equal(
    m.colorNameById["VariableID:1:4"],
    "--zen-color-icon-default",
  );
  assert.equal(
    m.colorNameById["VariableID:1:8"],
    "--zen-color-bg-selected",
  );
});

test("primitive palette path drops the 'primitive' segment", function () {
  var m = maps();
  assert.equal(
    m.colorNameById["VariableID:1:7"],
    "--zen-color-royal-blue-500",
  );
});

test("length variables land in lengthNameById, not colorNameById", function () {
  var m = maps();
  assert.equal(m.lengthNameById["VariableID:1:2"], "--zen-spacing-xs");
  assert.equal(m.lengthNameById["VariableID:1:3"], "--zen-border-radius-sm");
  assert.equal(m.colorNameById["VariableID:1:2"], undefined);
});

test("a COLOR variable with no published color-valued var is dropped everywhere", function () {
  var m = maps();
  // color-border-error must NOT fall through to the composite --zen-border-error.
  assert.equal(m.varNameById["VariableID:1:5"], undefined);
  assert.equal(m.colorNameById["VariableID:1:5"], undefined);
});

test("a composite-valued var is a generic ref name but never a color/length slot name", function () {
  var m = maps();
  assert.equal(m.varNameById["VariableID:1:6"], "--zen-border-default");
  assert.equal(m.colorNameById["VariableID:1:6"], undefined);
  assert.equal(m.lengthNameById["VariableID:1:6"], undefined);
});

test("an id whose key is absent from the bindings resolves to nothing", function () {
  var m = maps();
  assert.equal(m.varNameById["VariableID:1:9"], undefined);
});

test("missing or stub inputs yield empty maps, never a throw", function () {
  [
    {},
    { idsExport: null, bindingsRaw: null, tokensCssText: null },
    { idsExport: { ids: {} }, bindingsRaw: BINDINGS_RAW, tokensCssText: TOKENS_CSS },
    { idsExport: { ids: null }, bindingsRaw: { variables: "bogus" }, tokensCssText: 7 },
  ].forEach(function (input) {
    var m = T.buildTokenNameMaps(input);
    assert.deepEqual(m.varNameById, {});
    assert.deepEqual(m.colorNameById, {});
    assert.deepEqual(m.lengthNameById, {});
  });
});
