"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var fs = require("fs");
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");
var N = require("../scripts/sync/normalize-anatomy");

var schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "schemas", "anatomy.json"), "utf8"),
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
    slug: "tag-default",
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
    slug: "tag-default",
    kit: "dskit",
    syncedAt: "2026-07-03",
    source: { fileKey: "X", nodeId: "7257:3040" },
  });
  var v = validator();
  assert.ok(v(out), JSON.stringify(v.errors));
});
