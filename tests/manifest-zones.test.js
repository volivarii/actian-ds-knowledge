"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "paths-manifest.json"), "utf8"),
);

var EXPECTED_ZONES = ["contract", "knowledge", "metadata"];

function manifestPrefixes(m) {
  var set = new Set();
  for (var k in m.paths) set.add(k.split(".")[0]);
  for (var c in m.collections) set.add(c.split(".")[0]);
  return Array.from(set);
}

// Real zone names = keys of _zones NOT starting with "_" (so _comment and
// _pendingEviction are excluded from the zone vocabulary).
function zoneNames(z) {
  return Object.keys(z).filter(function (k) {
    return k[0] !== "_";
  });
}

test("_zones exists and uses exactly the expected vocabulary", function () {
  assert.ok(manifest._zones, "manifest._zones is missing");
  assert.deepEqual(zoneNames(manifest._zones).sort(), EXPECTED_ZONES);
});

test("_zones + _pendingEviction classify every prefix exactly once", function () {
  var z = manifest._zones;
  var declared = {};
  zoneNames(z)
    .concat(["_pendingEviction"])
    .forEach(function (list) {
      (z[list] || []).forEach(function (prefix) {
        assert.ok(
          !(prefix in declared),
          "prefix '" + prefix + "' is declared in two lists",
        );
        declared[prefix] = list;
      });
    });

  manifestPrefixes(manifest).forEach(function (prefix) {
    assert.ok(
      prefix in declared,
      "manifest prefix '" + prefix + "' is not classified in _zones",
    );
  });
});

test("_pendingEviction holds exactly the consumer-specific artifacts", function () {
  assert.deepEqual((manifest._zones._pendingEviction || []).slice().sort(), [
    "fmToDsMap",
  ]);
});
