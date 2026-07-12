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

// ---------------------------------------------------------------------------
// Icons kind: the gap that let 29 icons vanish into main unnoticed
// (syncs #365 + #378, 2026-07-07/08).
//
// The icons phase had NO removal detection at all: its verdict was literally
// `iconsWrote ? "additive" : "unchanged"`. So when the Figma icon rework made
// 28 glyphs stop rendering, the sync classified the loss as ADDITIVE, applied
// the auto-merge label, and shipped it to main two minutes later. The plugin's
//
// A previously-clean icon that is no longer in the derived set is a BREAKING
// change for consumers: their rendered glyph silently becomes empty.
// ---------------------------------------------------------------------------

function iconSet(slugs) {
  var icons = {};
  slugs.forEach(function (s) {
    icons[s] = { viewBox: "0 0 24 24", body: "<path d=\"M0 0h24v24H0z\"/>" };
  });
  return { _schema_version: 1, icons: icons };
}

test("classifier(icons): losing a previously-clean icon is BREAKING, not additive", function () {
  var res = classifier({
    fileKind: "icons",
    before: iconSet(["add", "chart-bar", "close"]),
    after: iconSet(["add", "close"]),
    degraded: [{ slug: "chart-bar", reason: "render-failed" }],
  });
  assert.equal(res.category, "breaking", "a lost glyph must block auto-merge");
  assert.ok(
    res.reasons.some(function (r) {
      return /chart-bar/.test(r);
    }),
    "the reason must name the lost icon, got: " + JSON.stringify(res.reasons),
  );
  assert.match(res.changelog, /chart-bar/);
  assert.match(res.changelog, /render-failed/, "surface WHY it was lost");
});

test("classifier(icons): a multi-icon loss classifies breaking, one reason per lost glyph", function () {
  var before = iconSet(["add", "asleep", "chart-bar", "chart-pie", "expand", "mail"]);
  var after = iconSet(["add"]);
  var res = classifier({
    fileKind: "icons",
    before: before,
    after: after,
    degraded: [
      { slug: "asleep", reason: "render-failed" },
      { slug: "chart-bar", reason: "render-failed" },
      { slug: "chart-pie", reason: "render-failed" },
      { slug: "expand", reason: "render-failed" },
      { slug: "mail", reason: "render-failed" },
    ],
  });
  assert.equal(res.category, "breaking");
  assert.equal(res.reasons.length, 5, "one reason per lost icon");
});

test("classifier(icons): new icons only is additive", function () {
  var res = classifier({
    fileKind: "icons",
    before: iconSet(["add"]),
    after: iconSet(["add", "sparkle"]),
    degraded: [],
  });
  assert.equal(res.category, "additive");
  assert.equal(res.reasons.length, 0);
  assert.match(res.changelog, /sparkle/);
});

test("classifier(icons): identical sets are unchanged (no-op nights stay no-op)", function () {
  var res = classifier({
    fileKind: "icons",
    before: iconSet(["add", "close"]),
    after: iconSet(["add", "close"]),
    degraded: [],
  });
  assert.equal(res.category, "unchanged");
  assert.equal(res.reasons.length, 0);
});

test("classifier(icons): a redrawn glyph (same slug, new body) is additive, not breaking", function () {
  var before = iconSet(["add"]);
  var after = { _schema_version: 1, icons: { add: { viewBox: "0 0 24 24", body: "<path d=\"M1 1h2v2H1z\"/>" } } };
  var res = classifier({ fileKind: "icons", before: before, after: after, degraded: [] });
  assert.equal(res.category, "additive", "the glyph still resolves, so consumers do not break");
  assert.equal(res.reasons.length, 0);
});

test("classifier(icons): degraded icons that were NEVER clean do not block the sync", function () {
  // A brand-new icon that lands multicolor was never in `before`, so nothing
  // regressed for consumers. It belongs on the worklist, not in the gate.
  var res = classifier({
    fileKind: "icons",
    before: iconSet(["add"]),
    after: iconSet(["add"]),
    degraded: [{ slug: "brand-new-multicolor-thing", reason: "multicolor" }],
  });
  assert.equal(res.category, "unchanged");
  assert.equal(res.reasons.length, 0);
});

test("classifier(icons): a ghost (node-missing) is reported as a STALE REGISTRY, not a bad glyph", function () {
  var res = classifier({
    fileKind: "icons",
    before: iconSet(["add", "misuse-outline", "attachments"]),
    after: iconSet(["add"]),
    degraded: [
      { slug: "misuse-outline", reason: "node-missing" },
      { slug: "attachments", reason: "multicolor" },
    ],
  });
  assert.equal(res.category, "breaking");
  // The two failure modes must not be conflated: one means Figma deleted the
  // node (registry is stale), the other means the drawing is not monochrome.
  assert.match(res.changelog, /Stale registry: ghost components \(1\)/);
  assert.match(res.changelog, /misuse-outline.*node no longer exists in Figma/);
  assert.match(res.changelog, /Lost icons \(1\)/);
  assert.match(res.changelog, /attachments.*multicolor/);
});
