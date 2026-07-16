"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var fs = require("node:fs");
var D = require("../../scripts/render/derive-dtcg.js");
var toDtcg = D.toDtcg;

test("toDtcg: color leaf gets $value + $type color", function () {
  var out = toDtcg({ color: { action: { primary: "#0F5FDC" } } });
  assert.deepEqual(out.color.action.primary, {
    $value: "#0F5FDC",
    $type: "color",
  });
});

test("toDtcg: px dimension gets $type dimension", function () {
  var out = toDtcg({ space: { sm: "8px" } });
  assert.equal(out.space.sm.$type, "dimension");
});

test("toDtcg: an already-DTCG leaf passes through, keeping oklch, dropping Figma internals", function () {
  var out = toDtcg({
    color: {
      primitive: {
        white: {
          $type: "color",
          $value: "#FFFFFF",
          $extensions: {
            "com.actian.oklch": "oklch(1 0 89.9)",
            "com.figma": { variableKey: "abc123", scopes: ["ALL_SCOPES"] },
          },
        },
      },
    },
  });
  var leaf = out.color.primitive.white;
  assert.equal(leaf.$value, "#FFFFFF");
  assert.equal(leaf.$type, "color");
  assert.equal(leaf.$extensions["com.actian.oklch"], "oklch(1 0 89.9)");
  assert.equal(leaf.$extensions["com.figma"], undefined, "Figma internals stripped");
});

test("toDtcg: a DTCG alias reference is preserved verbatim", function () {
  var out = toDtcg({
    color: { action: { primary: { $type: "color", $value: "{color.primitive.blue.500}" } } },
  });
  assert.equal(out.color.action.primary.$value, "{color.primitive.blue.500}");
});

test("toDtcg: the real tokens.json becomes clean portable DTCG", function () {
  var tokens = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../tokens/tokens.json"), "utf8"),
  );
  var out = toDtcg(tokens);
  // repo-internal provenance is gone
  assert.equal(out._schema_version, undefined, "_schema_version dropped");
  assert.equal(out.$metadata, undefined, "$metadata dropped");
  // standard DTCG top-level annotations survive
  assert.ok(out.$schema, "$schema kept");
  // every leaf carries $value + $type and no leaked Figma key
  var leaves = 0;
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Object.prototype.hasOwnProperty.call(node, "$value")) {
      leaves++;
      assert.ok(node.$type, "leaf has $type");
      if (node.$extensions) {
        assert.equal(
          node.$extensions["com.figma"],
          undefined,
          "no Figma internals in any leaf",
        );
      }
      return;
    }
    Object.keys(node).forEach(function (k) {
      if (k[0] === "$") return;
      walk(node[k]);
    });
  })(out);
  assert.ok(leaves > 50, "converted a real token set (" + leaves + " leaves)");
});
