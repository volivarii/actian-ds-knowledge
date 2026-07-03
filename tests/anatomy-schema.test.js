"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var fs = require("fs");
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");

var schema = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "schemas", "anatomy.json"),
    "utf8",
  ),
);
function makeValidator() {
  var ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}
function minimalFile(overrides) {
  return Object.assign(
    {
      _schema_version: 1,
      slug: "button",
      kit: "dskit",
      synced_at: "2026-06-11",
      source: { fileKey: "X", nodeId: "1:1" },
      quality: { nodesTotal: 1, nodesNormalized: 1, ratio: 1, degraded: [] },
      root: {
        name: "Button",
        kind: "container",
        layout: {
          axis: "row",
          gap: "8px",
          padding: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
          align: { main: "center", cross: "center" },
          sizing: { h: "hug", v: "hug" },
        },
      },
    },
    overrides || {},
  );
}

test("valid minimal anatomy file passes", function () {
  var v = makeValidator();
  assert.ok(v(minimalFile()), JSON.stringify(v.errors));
});

test("instance node with slug passes; recursion-stop has no children", function () {
  var v = makeValidator();
  var ok = minimalFile({
    root: {
      name: "Checkbox",
      kind: "instance",
      slug: "checkbox-with-label",
      props: { State: "Default" },
    },
  });
  assert.ok(v(ok), JSON.stringify(v.errors));
});

test("non-normalizable node passes with rawHint", function () {
  var v = makeValidator();
  var ok = minimalFile({
    root: {
      name: "Overlay",
      kind: "container",
      normalizable: false,
      rawHint: { layoutMode: "NONE" },
      children: [],
    },
  });
  assert.ok(v(ok), JSON.stringify(v.errors));
});

test("missing quality.ratio fails", function () {
  var v = makeValidator();
  var bad = minimalFile({
    quality: { nodesTotal: 1, nodesNormalized: 1, degraded: [] },
  });
  assert.equal(v(bad), false);
});

test("unknown kind fails", function () {
  var v = makeValidator();
  var bad = minimalFile({ root: { name: "x", kind: "widget" } });
  assert.equal(v(bad), false);
});

test("node with appearance (background/border/radius) validates", function () {
  var v = makeValidator();
  var ok = minimalFile({
    root: {
      name: "Tag",
      kind: "container",
      appearance: {
        background: "#f2f6f8",
        border: { color: "#607d8c", width: "1px" },
        radius: "4px",
      },
      layout: {
        axis: "row",
        gap: "4px",
        padding: { top: "0px", right: "8px", bottom: "0px", left: "8px" },
        align: { main: "center", cross: "center" },
        sizing: { h: "hug", v: "hug" },
      },
    },
  });
  assert.ok(v(ok), JSON.stringify(v.errors));
});

test("text appearance validates; unknown appearance key rejected", function () {
  var v = makeValidator();
  var textOk = minimalFile({
    root: {
      name: "Label",
      kind: "text",
      text: "Purple",
      appearance: { text: { color: "#50505d", size: "14px", weight: 400 } },
    },
  });
  assert.ok(v(textOk), JSON.stringify(v.errors));

  var bad = minimalFile({
    root: { name: "Tag", kind: "container", appearance: { bogus: 1 } },
  });
  assert.equal(v(bad), false);
});

test("schema accepts per-variant appearance + variantDefaults + quality extras", function () {
  var v = makeValidator();
  var doc = {
    _schema_version: 1,
    slug: "banner",
    kit: "dskit",
    variantDefaults: { Type: "Default" },
    quality: {
      nodesTotal: 1,
      nodesNormalized: 1,
      ratio: 1,
      degraded: [],
      structuralVariants: [
        { prop: "State", value: "Hover", path: "0", reason: "childCount:3!=4" },
      ],
      uncapturedValues: [
        { prop: "Intent", value: "Ghost", reason: "no isolated variant" },
      ],
    },
    root: {
      name: "Banner",
      kind: "container",
      appearance: {
        background: "#ffffff",
        variants: [
          { prop: "Type", values: ["Danger"], background: "#dc3514" },
          { prop: "Emphasis", values: ["Ghost"], border: null },
        ],
      },
    },
  };
  assert.ok(v(doc), JSON.stringify(v.errors));
});

test("schema rejects a variant entry missing prop/values", function () {
  var v = makeValidator();
  var doc = {
    _schema_version: 1,
    slug: "x",
    kit: "dskit",
    quality: { nodesTotal: 1, nodesNormalized: 1, ratio: 1, degraded: [] },
    root: {
      name: "x",
      kind: "container",
      appearance: { variants: [{ background: "#fff" }] },
    },
  };
  assert.equal(v(doc), false);
});
