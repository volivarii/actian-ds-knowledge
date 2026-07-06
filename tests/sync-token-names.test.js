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

test("published semantic color variables land in colorNameById and varNameById", function () {
  var m = maps();
  assert.equal(m.colorNameById["VariableID:1:4"], "--zen-color-icon-default");
  assert.equal(m.varNameById["VariableID:1:4"], "--zen-color-icon-default");
  assert.equal(m.colorNameById["VariableID:1:8"], "--zen-color-bg-selected");
});

test("no segment guessing: a primitive palette carries no name even when the dropped-segment var is published", function () {
  // white -> color.primitive.white, royal-blue/500 -> color.primitive.royal-blue.500.
  // The fixture css DOES publish the segment-dropped forms (--zen-color-white,
  // --zen-color-royal-blue-500), yet the join must NOT reach them: only the
  // full --zen-color-primitive-* form qualifies, and it is unpublished, so
  // primitives resolve to value-only. Guessing the dropped form is exactly what
  // mislabeled the 32px height scale as the 8px --zen-size-* scale in prod.
  var m = maps();
  assert.equal(m.varNameById["VariableID:1:1"], undefined); // white
  assert.equal(m.colorNameById["VariableID:1:1"], undefined);
  assert.equal(m.varNameById["VariableID:1:7"], undefined); // royal-blue/500
  assert.equal(m.colorNameById["VariableID:1:7"], undefined);
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
    {
      idsExport: { ids: {} },
      bindingsRaw: BINDINGS_RAW,
      tokensCssText: TOKENS_CSS,
    },
    {
      idsExport: { ids: null },
      bindingsRaw: { variables: "bogus" },
      tokensCssText: 7,
    },
  ].forEach(function (input) {
    var m = T.buildTokenNameMaps(input);
    assert.deepEqual(m.varNameById, {});
    assert.deepEqual(m.colorNameById, {});
    assert.deepEqual(m.lengthNameById, {});
  });
});

// ─── Real-data invariants (not frozen snapshots) ────────────────────────────
// The synthetic fixtures above hand-author tokens.css; these run the join over
// the REAL committed bindings + tokens.css so a regression that only shows up
// against generator output cannot ship green.
var fs = require("node:fs");
var path = require("node:path");
var REPO_ROOT = path.join(__dirname, "..");

function realMapsForAllKeys() {
  var bindingsRaw = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, "tokens", "src", "figma-bindings-raw.json"),
      "utf8",
    ),
  );
  var tokensCssText = fs.readFileSync(
    path.join(REPO_ROOT, "tokens", "tokens.css"),
    "utf8",
  );
  var vars = bindingsRaw.variables || [];
  // Exercise EVERY real variable by mapping a synthetic id -> its stable key.
  var ids = {};
  vars.forEach(function (v, i) {
    if (v && v.key) ids["VID:" + i] = { key: v.key };
  });
  return {
    vars: vars,
    maps: T.buildTokenNameMaps({
      idsExport: { ids: ids },
      bindingsRaw: bindingsRaw,
      tokensCssText: tokensCssText,
    }),
  };
}

test("real bindings + tokens.css: the 'Height' scale never collapses into the --zen-size-* scale", function () {
  // Data-derived invariant: size-height-* (32/40/48/56px) must NEVER resolve
  // to the unrelated --zen-size-* scale (8/16/24/32px). Direct regression guard
  // for the removed structural-segment reduction, which mislabeled all four.
  var r = realMapsForAllKeys();
  var sizeScale = /^--zen-size-(2xs|xs|sm|md|lg|xl)$/;
  var violations = [];
  r.vars.forEach(function (v, i) {
    if (!v || typeof v.name !== "string") return;
    var isHeight =
      v.variableCollectionName === "Height" || /^size-height-/.test(v.name);
    if (!isHeight) return;
    var name = r.maps.varNameById["VID:" + i];
    if (name && sizeScale.test(name)) violations.push(v.name + " -> " + name);
  });
  assert.deepEqual(violations, []);
});

test("real bindings + tokens.css: every ridden name is a published --zen-* var (no guessed names)", function () {
  // The join's core contract on real data: any name it emits exists verbatim
  // in tokens.css. Robust whether the id export is empty or populated.
  var r = realMapsForAllKeys();
  var defined = T.__parseDefinedVars(
    fs.readFileSync(path.join(REPO_ROOT, "tokens", "tokens.css"), "utf8"),
  );
  [r.maps.varNameById, r.maps.colorNameById, r.maps.lengthNameById].forEach(
    function (map) {
      Object.keys(map).forEach(function (id) {
        assert.ok(
          map[id] in defined,
          map[id] + " is not a published --zen-* custom property",
        );
      });
    },
  );
});

test("loadTokenNameMaps reads the committed artifacts without throwing (production entry point)", function () {
  // Covers the disk-backed wrapper the sync actually calls. With the committed
  // empty id-export stub it returns empty maps (today's values-only capture);
  // once populated it must still only ever yield valid --zen-* names.
  var m = T.loadTokenNameMaps(REPO_ROOT);
  var defined = T.__parseDefinedVars(
    fs.readFileSync(path.join(REPO_ROOT, "tokens", "tokens.css"), "utf8"),
  );
  [m.varNameById, m.colorNameById, m.lengthNameById].forEach(function (map) {
    assert.equal(typeof map, "object");
    Object.keys(map).forEach(function (id) {
      assert.ok(map[id] in defined);
    });
  });
});
