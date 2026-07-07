"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var D = require("../scripts/graph/derive-graph.js");
var ROOT = path.join(__dirname, "..");

test("derive(): component nodes carry figmaKey + figmaNodeId; other node types do not", function () {
  D.derive();
  var g = JSON.parse(fs.readFileSync(path.join(ROOT, "graph/dist/graph.json"), "utf8"));
  var reg = JSON.parse(fs.readFileSync(path.join(ROOT, "components/dist/registries/dskit.json"), "utf8"));
  var comps = g.nodes.filter(function (n) { return n.type === "component"; });
  assert.equal(comps.length, 613);
  assert.ok(comps.every(function (n) { return typeof n.figmaKey === "string" && typeof n.figmaNodeId === "string"; }));
  // spot-check a known component equals its registry key/nodeId
  var badge = g.nodes.find(function (n) { return n.id === "component:badge"; });
  assert.equal(badge.figmaKey, reg.components.badge.key);
  assert.equal(badge.figmaNodeId, reg.components.badge.nodeId);
  // non-component nodes never carry it
  var nonComp = g.nodes.filter(function (n) { return n.type !== "component"; });
  assert.ok(nonComp.every(function (n) { return n.figmaKey === undefined && n.figmaNodeId === undefined; }));
});
