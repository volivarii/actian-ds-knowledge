"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var D = require("../scripts/spike/diagnose-nested-resolution.js");

// registry maps: a Card set (nodeId "10:0", slug "card-for-items") and an icon
// (nodeId "20:0", slug "arrow-down"). keyToSlug mirrors on key.
var nodeIdToSlug = { "10:0": "card-for-items", "20:0": "arrow-down" };
var keyToSlug = { kCARD: "card-for-items", kARROW: "arrow-down" };
// components dict: a Tag VARIANT (its own id "99:1") whose componentSetId is the
// Tag set "30:0" (NOT in the registry here -> would still be a miss); a Tag
// variant "99:2" whose set "10:0" IS a registry nodeId (the bridge hit); an icon
// entry "20:0" resolvable directly by node id.
var entries = {
  "99:1": { key: "kTAGX", name: "Tag", componentSetId: "30:0" },
  "99:2": { key: "kTAGY", name: "Tag", componentSetId: "10:0" },
  "20:0": { key: "kARROW", name: "arrow-down" },
};

test("classifyInstance: componentSetId bridge hit (variant -> set nodeId in registry)", function () {
  var r = D.classifyInstance(
    { name: "Tag", componentId: "99:2" },
    entries,
    nodeIdToSlug,
    keyToSlug,
  );
  assert.equal(r.resolvedToday, false); // not resolvable by nodeId or key today
  assert.equal(r.componentSetId, "10:0");
  assert.equal(r.resolvableViaSetId, true); // the bridge would resolve it
  assert.equal(r.slugViaSetId, "card-for-items");
});

test("classifyInstance: icon resolves today via node id", function () {
  var r = D.classifyInstance(
    { name: "arrow-down", componentId: "20:0" },
    entries,
    nodeIdToSlug,
    keyToSlug,
  );
  assert.equal(r.resolvedToday, true);
  assert.equal(r.slugViaNodeId, "arrow-down");
});

test("classifyInstance: unresolvable (set not in registry, no key match)", function () {
  var r = D.classifyInstance(
    { name: "Tag", componentId: "99:1" },
    entries,
    nodeIdToSlug,
    keyToSlug,
  );
  assert.equal(r.resolvedToday, false);
  assert.equal(r.resolvableViaSetId, false); // set "30:0" not a registry nodeId
  assert.equal(r.hasEntry, true);
});

test("collectInstances: finds nested INSTANCE nodes recursively", function () {
  var doc = {
    type: "COMPONENT",
    children: [
      {
        type: "FRAME",
        children: [{ type: "INSTANCE", name: "Tag", componentId: "99:2" }],
      },
      { type: "INSTANCE", name: "arrow-down", componentId: "20:0" },
    ],
  };
  var got = D.collectInstances(doc);
  assert.equal(got.length, 2);
});

test("mergeComponentEntries: unions the per-subtree components dicts", function () {
  var nodes = {
    "10:0": {
      components: { "99:2": { key: "kTAGY", componentSetId: "10:0" } },
    },
    "20:0": { components: { "20:0": { key: "kARROW" } } },
  };
  var m = D.mergeComponentEntries(nodes);
  assert.equal(m["99:2"].componentSetId, "10:0");
  assert.equal(m["20:0"].key, "kARROW");
});

test("aggregate: pctResolvableViaSetId is over the unresolved-today subset", function () {
  var records = [
    {
      resolvedToday: true,
      resolvableViaSetId: false,
      componentId: "20:0",
      hasEntry: true,
      componentSetId: null,
      slugViaKey: "arrow-down",
    },
    {
      resolvedToday: false,
      resolvableViaSetId: true,
      componentId: "99:2",
      hasEntry: true,
      componentSetId: "10:0",
      slugViaKey: null,
    },
    {
      resolvedToday: false,
      resolvableViaSetId: false,
      componentId: "99:1",
      hasEntry: true,
      componentSetId: "30:0",
      slugViaKey: null,
    },
  ];
  var s = D.aggregate(records);
  assert.equal(s.totalInstances, 3);
  assert.equal(s.resolvedToday, 1);
  assert.equal(s.unresolved, 2);
  assert.equal(s.unresolvedResolvableViaSetId, 1);
  assert.equal(s.pctResolvableViaSetId, 50); // 1 of 2 unresolved
});

test("buildMaps: nodeIdToSlug + keyToSlug + non-icon ids from a registry", function () {
  var reg = {
    components: {
      "card-for-items": {
        nodeId: "10:0",
        key: "kCARD",
        category: "Data Display",
      },
      "arrow-down": { nodeId: "20:0", key: "kARROW", category: "Icons" },
    },
  };
  var m = D.buildMaps(reg);
  assert.equal(m.nodeIdToSlug["10:0"], "card-for-items");
  assert.equal(m.keyToSlug["kCARD"], "card-for-items");
  assert.deepEqual(m.ids, ["10:0"]); // icons excluded from the fetch set
});
