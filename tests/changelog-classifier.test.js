"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var classifier = require(
  path.join(__dirname, "..", "scripts", "changelog", "changelog-classifier.js"),
);

test("classifier — identical object property-defaults do NOT trigger 'breaking' (regression test for INSTANCE_SWAP false positive)", function () {
  // Two registries with the same component, both have a property whose
  // default is a structurally-equal but reference-different object.
  // Before the fix: classified as breaking. After the fix: unchanged.
  var before = {
    library: "ds",
    fileKey: "test",
    components: {
      card: {
        name: "Card",
        key: "k-card",
        nodeId: "1:1",
        importMethod: "set",
        description: "",
        page: "✅ Card",
        properties: {
          "Slot#15927:0": {
            type: "INSTANCE_SWAP",
            default: { guid: { sessionID: -1, localID: -1 } },
          },
        },
        nestedComponents: [],
        variants: {},
      },
    },
  };
  // Same shape, fresh object references (mimics JSON.parse → JSON.parse roundtrip)
  var after = JSON.parse(JSON.stringify(before));

  var result = classifier({
    before: before,
    after: after,
    fileKind: "registry",
  });
  assert.equal(
    result.category,
    "unchanged",
    "verdict should be unchanged when registries are structurally identical",
  );
  assert.equal(result.reasons.length, 0, "no breaking reasons");
});

test("classifier — identical object property-defaults do NOT trigger 'breaking' when an unrelated field changes (entryBreakingReasons path)", function () {
  // This test specifically exercises entryBreakingReasons. We force the
  // diff past isRegistryUnchanged by changing `description` (which is
  // diffed in shallowEqualEntry but NOT flagged by entryBreakingReasons).
  // The modified-entry path then re-evaluates property defaults: the bug
  // was that reference equality on object defaults always reported a
  // bogus "property default change" reason, flipping the verdict from
  // additive → breaking.
  var before = {
    library: "ds",
    fileKey: "test",
    components: {
      card: {
        name: "Card",
        key: "k-card",
        nodeId: "1:1",
        importMethod: "set",
        description: "Old description",
        page: "✅ Card",
        properties: {
          "Slot#15927:0": {
            type: "INSTANCE_SWAP",
            default: { guid: { sessionID: -1, localID: -1 } },
          },
        },
        nestedComponents: [],
        variants: {},
      },
    },
  };
  var after = JSON.parse(JSON.stringify(before));
  after.components.card.description = "New description";

  var result = classifier({
    before: before,
    after: after,
    fileKind: "registry",
  });
  assert.equal(
    result.category,
    "additive",
    "verdict should be additive (description change is not breaking) — NOT breaking due to object-default false positive",
  );
  assert.equal(
    result.reasons.length,
    0,
    "no breaking reasons should be emitted for structurally-identical object defaults",
  );
});

test("classifier — genuinely different object property-defaults DO trigger 'breaking'", function () {
  var before = {
    library: "ds",
    fileKey: "test",
    components: {
      card: {
        name: "Card",
        key: "k-card",
        nodeId: "1:1",
        importMethod: "set",
        description: "",
        page: "✅ Card",
        properties: {
          "Slot#15927:0": {
            type: "INSTANCE_SWAP",
            default: { guid: { sessionID: -1, localID: -1 } },
          },
        },
        nestedComponents: [],
        variants: {},
      },
    },
  };
  var after = JSON.parse(JSON.stringify(before));
  after.components.card.properties["Slot#15927:0"].default.guid.localID = 42;

  var result = classifier({
    before: before,
    after: after,
    fileKind: "registry",
  });
  assert.equal(result.category, "breaking");
  assert.ok(
    result.reasons.some(function (r) {
      return r.indexOf("property default change") >= 0;
    }),
    "should include a property-default-change reason",
  );
});

test("classifier — adding categorySlug to an entry is detected as additive (not silently unchanged)", function () {
  // Regression for the Move-3 rollout gap (2026-06-01): transform-registry
  // buildEntry emits `categorySlug`, but the sync only writes the registry
  // when the verdict != "unchanged". If shallowEqualEntry ignores
  // categorySlug, the field never reaches disk on a metadata-only sync —
  // exactly what happened to v0.25.7. categorySlug MUST be in the compared
  // keys so its first appearance flips the verdict to additive (one-time
  // noise, same as category/status when they were introduced).
  var before = {
    library: "ds",
    fileKey: "test",
    components: {
      card: {
        name: "Card",
        key: "k-card",
        nodeId: "1:1",
        importMethod: "set",
        description: "",
        page: "✅ Card",
        category: "Layout",
        properties: {},
        nestedComponents: [],
        variants: {},
      },
    },
  };
  var after = JSON.parse(JSON.stringify(before));
  after.components.card.categorySlug = "layout";

  var result = classifier({
    before: before,
    after: after,
    fileKind: "registry",
  });
  assert.notEqual(
    result.category,
    "unchanged",
    "adding categorySlug must be detected — otherwise the sync never writes it",
  );
  assert.equal(
    result.category,
    "additive",
    "categorySlug addition is additive, not breaking",
  );
  assert.equal(
    result.reasons.length,
    0,
    "no breaking reasons for an additive field",
  );
});
