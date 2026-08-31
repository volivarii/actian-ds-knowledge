"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var fs = require("fs");
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");
var N = require("../scripts/sync/normalize-anatomy");

var schema = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "schemas", "anatomy.json"),
    "utf8",
  ),
);
function validator() {
  var ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

// Realistic raw Figma document node for a tag: a padded auto-layout container
// with a fill, stroke, corner radius, and a single text child.
var rawTag = {
  type: "COMPONENT",
  name: "Color=Gray",
  id: "7257:3040",
  layoutMode: "HORIZONTAL",
  itemSpacing: 4,
  paddingTop: 0,
  paddingRight: 8,
  paddingBottom: 0,
  paddingLeft: 8,
  primaryAxisAlignItems: "CENTER",
  counterAxisAlignItems: "CENTER",
  layoutSizingHorizontal: "HUG",
  layoutSizingVertical: "FIXED",
  fills: [{ type: "SOLID", color: { r: 0.949, g: 0.965, b: 0.973, a: 1 } }],
  strokes: [{ type: "SOLID", color: { r: 0.376, g: 0.49, b: 0.549, a: 1 } }],
  strokeWeight: 1,
  cornerRadius: 4,
  children: [
    {
      type: "TEXT",
      name: "Label",
      id: "7257:3041",
      characters: "Gray",
      fills: [{ type: "SOLID", color: { r: 0.314, g: 0.314, b: 0.365, a: 1 } }],
      style: { fontSize: 14, fontWeight: 400, lineHeightPx: 20 },
    },
  ],
};

test("buildAnatomyFile emits resolved appearance on root and text child", function () {
  var out = N.buildAnatomyFile(rawTag, {
    slug: "read-only-tag",
    kit: "dskit",
    syncedAt: "2026-07-03",
    source: { fileKey: "X", nodeId: "7257:3040" },
  });
  assert.deepEqual(out.root.appearance, {
    background: "#f2f6f8",
    border: { color: "#607d8c", width: "1px" },
    radius: "4px",
  });
  assert.deepEqual(out.root.children[0].appearance, {
    text: { color: "#50505d", size: "14px", weight: 400, lineHeight: "20px" },
  });
});

test("enriched anatomy file validates against the schema", function () {
  var out = N.buildAnatomyFile(rawTag, {
    slug: "read-only-tag",
    kit: "dskit",
    syncedAt: "2026-07-03",
    source: { fileKey: "X", nodeId: "7257:3040" },
  });
  var v = validator();
  assert.ok(v(out), JSON.stringify(v.errors));
});

// tag-status: grouped root recolor across Status values (probe: Fail #fff4ec, Success #f0ffec)
test("deliverable: tag-status root recolors per Status, grouped by shared value", function () {
  function tag(name, bg) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 4,
      paddingTop: 0,
      paddingRight: 8,
      paddingBottom: 0,
      paddingLeft: 8,
      fills: [{ type: "SOLID", color: bg }],
      strokeWeight: 1,
      strokes: [{ type: "SOLID", color: bg }],
      cornerRadius: 4,
      children: [],
    };
  }
  var fail = { r: 1, g: 0.957, b: 0.925, a: 1 }; // #fff4ec
  var success = { r: 0.941, g: 1, b: 0.925, a: 1 }; // #f0ffec
  var variants = [tag("Status=Fail", fail), tag("Status=Success", success)];
  var out = N.buildAnatomyFile(variants[0], {
    slug: "tag-status",
    kit: "dskit",
    syncedAt: "d",
    source: {},
    variants: variants,
    defaultVariantName: "Status=Fail",
  });
  assert.deepEqual(out.root.appearance.variants, [
    {
      prop: "Status",
      values: ["Success"],
      background: "#f0ffec",
      border: { color: "#f0ffec", width: "1px" },
    },
  ]);
});

// tag-status grouping: Stopped and Offline recolor to the exact same background and
// border, so they must MERGE into one variants entry with a joined, sorted values
// array. Success recolors to a different value and stays isolated. This is the exact
// Tag merge-collapse behavior that is the presenting bug (proving grouping, not just
// distinct-value diffing).
test("deliverable: tag-status merges Status values that share an identical recolor", function () {
  function statusLeaf(name, color) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 4,
      paddingTop: 0,
      paddingRight: 8,
      paddingBottom: 0,
      paddingLeft: 8,
      fills: [{ type: "SOLID", color: color }],
      strokeWeight: 1,
      strokes: [{ type: "SOLID", color: color }],
      children: [],
    };
  }
  var fail = { r: 1, g: 0.957, b: 0.925, a: 1 }; // #fff4ec
  var stopped = { r: 0.882353, g: 0.882353, b: 0.901961, a: 1 }; // #e1e1e6
  var offline = { r: 0.882353, g: 0.882353, b: 0.901961, a: 1 }; // #e1e1e6, identical to Stopped
  var success = { r: 0.941, g: 1, b: 0.925, a: 1 }; // #f0ffec
  var variants = [
    statusLeaf("Status=Fail", fail),
    statusLeaf("Status=Stopped", stopped),
    statusLeaf("Status=Offline", offline),
    statusLeaf("Status=Success", success),
  ];
  var out = N.buildAnatomyFile(variants[0], {
    slug: "tag-status",
    kit: "dskit",
    syncedAt: "d",
    source: {},
    variants: variants,
    defaultVariantName: "Status=Fail",
  });
  assert.deepEqual(out.root.appearance.variants, [
    {
      prop: "Status",
      values: ["Offline", "Stopped"],
      background: "#e1e1e6",
      border: { color: "#e1e1e6", width: "1px" },
    },
    {
      prop: "Status",
      values: ["Success"],
      background: "#f0ffec",
      border: { color: "#f0ffec", width: "1px" },
    },
  ]);
});

// button: Intent paint delta; Hover overlay -> structural flag, no bogus delta
test("deliverable: button Intent recolors root; Hover overlay flags structural", function () {
  function btn(name, bg, extraChild) {
    var kids = extraChild ? [extraChild] : [];
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 8,
      paddingTop: 0,
      paddingRight: 12,
      paddingBottom: 0,
      paddingLeft: 12,
      fills: [{ type: "SOLID", color: bg }],
      cornerRadius: 9999,
      children: kids,
    };
  }
  var blue = { r: 0.059, g: 0.373, b: 0.863, a: 1 }; // #0f5fdc
  var red = { r: 0.863, g: 0.208, b: 0.078, a: 1 }; // #dc3514
  var overlay = {
    type: "FRAME",
    name: "State",
    fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 0.05 } }],
  };
  var variants = [
    btn("Intent=Default, State=Default", blue),
    btn("Intent=Critical, State=Default", red),
    btn("Intent=Default, State=Hover", blue, overlay),
  ];
  var out = N.buildAnatomyFile(variants[0], {
    slug: "button",
    kit: "dskit",
    syncedAt: "d",
    source: {},
    variants: variants,
    defaultVariantName: "Intent=Default, State=Default",
  });
  assert.deepEqual(out.root.appearance.variants, [
    { prop: "Intent", values: ["Critical"], background: "#dc3514" },
  ]);
  assert.deepEqual(out.quality.structuralVariants, [
    { prop: "State", value: "Hover", path: "", reason: "childCount:0!=1" },
  ]);
});
