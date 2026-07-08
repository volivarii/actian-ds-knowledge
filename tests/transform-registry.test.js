"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var T = require("../scripts/transformers/transform-registry");

function build() {
  return {
    registry: {
      components: {
        "card-for-items": { nodeId: "10:0", key: "kCARD" },
        "tag-catalog": { nodeId: "20:0", key: "kTAG" },
        "arrow-down": { nodeId: "40:0", key: "kARROW" },
      },
    },
    // card-for-items subtree: a nested Tag VARIANT instance (99:2 -> set 20:0)
    // and a direct icon instance (componentId 40:0 == arrow-down's registry nodeId).
    componentSetNodes: {
      "10:0": {
        document: {
          type: "COMPONENT_SET",
          children: [
            {
              type: "COMPONENT",
              children: [
                { type: "INSTANCE", componentId: "99:2" },
                { type: "INSTANCE", componentId: "40:0" },
              ],
            },
          ],
        },
        components: { "99:2": { componentSetId: "20:0" } },
      },
      "20:0": { document: { type: "COMPONENT_SET", children: [] } },
      "40:0": { document: { type: "COMPONENT", children: [] } },
    },
    standaloneNodes: {},
  };
}

test("populateNestedComponents: resolves a composite child via the componentSetId bridge", function () {
  var b = build();
  T._populateNestedComponents(
    b.registry,
    b.componentSetNodes,
    b.standaloneNodes,
  );
  var slugs = (b.registry.components["card-for-items"].nestedComponents || [])
    .map(function (n) {
      return n.slug;
    })
    .sort();
  assert.deepEqual(slugs, ["arrow-down", "tag-catalog"]); // composite (bridge) + icon (direct)
});

test("populateNestedComponents: the composite child carries source child-instance", function () {
  var b = build();
  T._populateNestedComponents(
    b.registry,
    b.componentSetNodes,
    b.standaloneNodes,
  );
  var tag = (
    b.registry.components["card-for-items"].nestedComponents || []
  ).find(function (n) {
    return n.slug === "tag-catalog";
  });
  assert.equal(tag.source, "child-instance");
});

test("populateNestedComponents: a private set (not a registry nodeId) is skipped; direct icon still resolves", function () {
  var b = build();
  b.componentSetNodes["10:0"].components["99:2"].componentSetId = "999:9"; // not a registry nodeId
  T._populateNestedComponents(
    b.registry,
    b.componentSetNodes,
    b.standaloneNodes,
  );
  var slugs = (
    b.registry.components["card-for-items"].nestedComponents || []
  ).map(function (n) {
    return n.slug;
  });
  assert.ok(!slugs.includes("tag-catalog"));
  assert.ok(slugs.includes("arrow-down"));
});

test("populateNestedComponents: two variant instances of the same set collapse to one entry (bridge dedup)", function () {
  var b = build();
  // a second Tag variant instance (99:3) whose set is also 20:0 (tag-catalog)
  b.componentSetNodes["10:0"].document.children[0].children.push({
    type: "INSTANCE",
    componentId: "99:3",
  });
  b.componentSetNodes["10:0"].components["99:3"] = { componentSetId: "20:0" };
  T._populateNestedComponents(
    b.registry,
    b.componentSetNodes,
    b.standaloneNodes,
  );
  var tags = (
    b.registry.components["card-for-items"].nestedComponents || []
  ).filter(function (n) {
    return n.slug === "tag-catalog";
  });
  assert.equal(tags.length, 1); // both variants dedup to a single entry
});

test("populateNestedComponents: a nested instance unknown to both nodeId and the components dict stays unresolved (no crash, no junk)", function () {
  var b = build();
  // "zz" is in neither nodeIdToSlug nor the components dict
  b.componentSetNodes["10:0"].document.children[0].children.push({
    type: "INSTANCE",
    componentId: "zz",
  });
  T._populateNestedComponents(
    b.registry,
    b.componentSetNodes,
    b.standaloneNodes,
  );
  var slugs = (
    b.registry.components["card-for-items"].nestedComponents || []
  ).map(function (n) {
    return n.slug;
  });
  assert.ok(!slugs.includes(undefined)); // no junk entry emitted
  assert.ok(slugs.includes("tag-catalog") && slugs.includes("arrow-down")); // known ones still resolve
});
