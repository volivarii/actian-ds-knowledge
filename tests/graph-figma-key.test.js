"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var D = require("../scripts/graph/derive-graph.js");
var ROOT = path.join(__dirname, "..");

test("derive(): component nodes carry figmaKey + figmaNodeId; other node types do not", function () {
  D.derive();
  var g = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.json"), "utf8"),
  );
  var reg = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "components/dist/registries/dskit.json"),
      "utf8",
    ),
  );
  var comps = g.nodes.filter(function (n) {
    return n.type === "component";
  });
  assert.equal(comps.length, 613);
  assert.ok(
    comps.every(function (n) {
      return (
        typeof n.figmaKey === "string" && typeof n.figmaNodeId === "string"
      );
    }),
  );
  // spot-check a known component equals its registry key/nodeId
  var badge = g.nodes.find(function (n) {
    return n.id === "component:badge";
  });
  assert.equal(badge.figmaKey, reg.components.badge.key);
  assert.equal(badge.figmaNodeId, reg.components.badge.nodeId);
  // non-component nodes never carry it
  var nonComp = g.nodes.filter(function (n) {
    return n.type !== "component";
  });
  assert.ok(
    nonComp.every(function (n) {
      return n.figmaKey === undefined && n.figmaNodeId === undefined;
    }),
  );
});

test("graph.jsonld carries figmaKey on component objects (queryable, lossless)", function () {
  D.derive();
  var ld = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.jsonld"), "utf8"),
  );
  var badge = ld["@graph"].find(function (o) {
    return o["@id"] === "component:badge";
  });
  assert.equal(badge["@type"], "Component");
  assert.equal(typeof badge.figmaKey, "string");
  // context maps the term so it is addressable, not an opaque blob
  var ctx = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/context.jsonld"), "utf8"),
  )["@context"];
  assert.equal(ctx.figmaKey, "actian-ds:figmaComponentKey");
  assert.equal(ctx.figmaNodeId, "actian-ds:figmaNodeId");
});

test("quality-report.json reports the slug_collisions count", function () {
  D.derive();
  // process.execPath (not the local-only NODE_BIN env) so this runs on CI too.
  require("node:child_process").execFileSync(
    process.execPath,
    ["scripts/graph/validate-graph.js"],
    { cwd: ROOT },
  );
  var qr = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/quality-report.json"), "utf8"),
  );
  var m = (Array.isArray(qr) ? qr : qr.metrics || []).find(function (x) {
    return x.metric === "slug_collisions";
  });
  assert.ok(m, "slug_collisions metric present");
  assert.equal(m.value, 22);
});
