"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var { validateZones } = require("../scripts/validate-manifest.js");

function manifestWith(zones, paths) {
  return { _zones: zones, paths: paths, collections: {} };
}

var GOOD_ZONES = {
  knowledge: ["accessibility", "components", "content", "foundations"],
  contract: ["graph"],
  metadata: ["appContext", "tokens"],
  _pendingEviction: ["fmToDsMap"],
};

test("validateZones flags an unclassified prefix", function () {
  var errors = validateZones(
    manifestWith(GOOD_ZONES, { "newdomain.thing": { path: "x" } }),
  );
  assert.ok(
    errors.some(function (e) {
      return /newdomain.*not classified/.test(e);
    }),
    "expected an unclassified-prefix error, got: " + JSON.stringify(errors),
  );
});

test("validateZones passes when every prefix is classified", function () {
  var errors = validateZones(
    manifestWith(GOOD_ZONES, {
      "accessibility.index": { path: "x" },
      "graph.bundle": { path: "y" },
      "tokens.json": { path: "z" },
    }),
  );
  assert.deepEqual(errors, []);
});

test("validateZones flags a missing _zones block", function () {
  var errors = validateZones({
    paths: { "accessibility.index": {} },
    collections: {},
  });
  assert.ok(
    errors.some(function (e) {
      return /_zones/.test(e);
    }),
    "expected a missing-_zones error, got: " + JSON.stringify(errors),
  );
});
