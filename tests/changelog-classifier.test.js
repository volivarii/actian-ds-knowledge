"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var classifier = require(
  path.join(__dirname, "..", "scripts", "changelog", "changelog-classifier.js"),
);

// ---------------------------------------------------------------------------
// Renames: breaking only when the old slug stops resolving
// ---------------------------------------------------------------------------
// A rename used to be breaking unconditionally, and any breaking reason makes
// the whole sync breaking, which commits nothing. So two display-name changes
// (`sticky-footer` to `action-bar`, `view-details` to `view-detail`) stalled four
// nights of otherwise additive work, including 241 icon updates, while the
// sync's own evidence said the identity had survived (knowledge #526).
//
// A rename is a consumer break only if the old slug stops resolving, so a
// display-name change that keeps the slug must not be breaking. A slug change
// still is: components/dist/identity.json can now resolve the old slug, but the
// verdict cannot see that yet (see renameBreaksResolution for why), so the rule
// deliberately stops here rather than claiming a capability that cannot fire.

function renamedRegistry(slug) {
  return {
    library: "ds",
    fileKey: "test",
    components: {
      [slug]: {
        name: slug === "sticky-footer" ? "Sticky footer" : "Action bar",
        key: "k-a",
        nodeId: "14747:9839",
        importMethod: "set",
        description: "",
        page: "✅ Action bar",
        properties: {},
        nestedComponents: [],
        variants: {},
      },
    },
  };
}

test("classifier — a slug rename is still breaking", function () {
  var result = classifier({
    before: renamedRegistry("sticky-footer"),
    after: renamedRegistry("action-bar"),
    fileKind: "registry",
  });

  assert.equal(result.category, "breaking");
  assert.equal(result.reasons.length, 1);
});

// knowledge #512: the differ reports a rename when the slug changes OR the
// display name changes, so editing a status emoji in a component's name pushed
// the verdict to breaking on its own. A name-only change cannot break slug
// resolution, because no consumer addresses a component by its display name.
test("classifier — a display-name change that keeps the slug is not breaking", function () {
  var before = renamedRegistry("action-bar");
  var after = JSON.parse(JSON.stringify(before));
  after.components["action-bar"].name = "Action bar ✍️";

  var result = classifier({
    before: before,
    after: after,
    fileKind: "registry",
  });

  assert.equal(result.category, "additive");
  assert.deepEqual(result.reasons, []);
});

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
    icons[s] = { viewBox: "0 0 24 24", body: '<path d="M0 0h24v24H0z"/>' };
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
  var before = iconSet([
    "add",
    "asleep",
    "chart-bar",
    "chart-pie",
    "expand",
    "mail",
  ]);
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
  var after = {
    _schema_version: 1,
    icons: { add: { viewBox: "0 0 24 24", body: '<path d="M1 1h2v2H1z"/>' } },
  };
  var res = classifier({
    fileKind: "icons",
    before: before,
    after: after,
    degraded: [],
  });
  assert.equal(
    res.category,
    "additive",
    "the glyph still resolves, so consumers do not break",
  );
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

// ---------------------------------------------------------------------------
// Media kind. Three phases still carried the SAME expression that shipped 29
// dead icons: `captured.length > 0 ? "additive" : "unchanged"`, with no code
// path to breaking. media/_index.json is the surface consumers actually resolve
// imagery through, so classifying it catches loss from ANY upstream media phase
// (a prune in media-preview, a vanished default capture, a whole slug going).
//
// It is a pure directory listing with no memory, so before this, 60 slugs
// disappearing and 60 appearing produced the identical verdict, and a
// prune-only night auto-merged a pull request that had deleted images under the
// message "byte-level maintenance writes only".
// ---------------------------------------------------------------------------

function mediaIdx(map) {
  return { _schema_version: 1, media: map };
}

test("classifier(media): a slug losing ALL its imagery is BREAKING", function () {
  var res = classifier({
    fileKind: "media",
    before: mediaIdx({ button: { preview: "a" }, tag: { preview: "b" } }),
    after: mediaIdx({ button: { preview: "a" } }),
  });
  assert.equal(res.category, "breaking");
  assert.match(res.reasons[0], /tag/);
  assert.match(res.changelog, /Lost media/);
});

test("classifier(media): a slug losing ONE role (its Variations board) is BREAKING", function () {
  // The docs page for this component silently loses its variations imagery.
  var res = classifier({
    fileKind: "media",
    before: mediaIdx({ button: { preview: "a", variations: "v" } }),
    after: mediaIdx({ button: { preview: "a" } }),
  });
  assert.equal(res.category, "breaking");
  assert.match(res.reasons[0], /button:variations/);
});

test("classifier(media): new imagery only is additive", function () {
  var res = classifier({
    fileKind: "media",
    before: mediaIdx({ button: { preview: "a" } }),
    after: mediaIdx({ button: { preview: "a" }, tag: { preview: "b" } }),
  });
  assert.equal(res.category, "additive");
  assert.equal(res.reasons.length, 0);
  assert.match(res.changelog, /New media/);
});

test("classifier(media): identical index is unchanged (no-op nights stay no-op)", function () {
  var res = classifier({
    fileKind: "media",
    before: mediaIdx({ button: { preview: "a", default: "d" } }),
    after: mediaIdx({ button: { preview: "a", default: "d" } }),
  });
  assert.equal(res.category, "unchanged");
});

test("classifier(media): a swap (one slug in, one slug out) is still BREAKING", function () {
  // The exact case a bare "did bytes change" check cannot see: the index is a
  // directory listing, so a loss and a gain net out to "wrote: true".
  var res = classifier({
    fileKind: "media",
    before: mediaIdx({ old: { preview: "a" } }),
    after: mediaIdx({ new: { preview: "b" } }),
  });
  assert.equal(
    res.category,
    "breaking",
    "a loss is a loss even when a gain masks the byte count",
  );
  assert.equal(res.reasons.length, 1);
});

test("classifier(media): a role that SHRINKS its frame count is BREAKING (the common loss)", function () {
  // pruneStaleCaptures deletes every `<role>-<n>.webp` where n >= the new count,
  // and its mass-prune guard explicitly exempts shrinks. So a Variations board
  // going 4 frames -> 1 silently deletes 3 images while the role KEY survives.
  // A name-only diff sees nothing. This is the loss that actually happens.
  var res = classifier({
    fileKind: "media",
    before: mediaIdx({ button: { variations: ["a", "b", "c", "d"] } }),
    after: mediaIdx({ button: { variations: ["a"] } }),
  });
  assert.equal(
    res.category,
    "breaking",
    "3 deleted images must not auto-merge",
  );
  assert.match(res.reasons[0], /button:variations/);
  assert.match(res.reasons[0], /4 -> 1/, "say how much was lost");
});

test("classifier(media): a role GROWING its frame count is additive", function () {
  var res = classifier({
    fileKind: "media",
    before: mediaIdx({ button: { variations: ["a"] } }),
    after: mediaIdx({ button: { variations: ["a", "b"] } }),
  });
  assert.equal(res.category, "additive");
  assert.equal(res.reasons.length, 0);
});

test("classifier(media): an unreadable prior index is BREAKING, not a guess", function () {
  // The index self-heals (it is rewritten from the media tree), but we cannot
  // tell whether anything vanished, so a human confirms. Throwing instead would
  // leave the corrupt file in place and kill every subsequent sync, which is the
  // exact failure this whole change exists to prevent.
  var res = classifier({
    fileKind: "media",
    before: null,
    after: mediaIdx({ button: { preview: "a" } }),
    beforeUnparseable: true,
  });
  assert.equal(res.category, "breaking");
  assert.match(res.reasons[0], /unreadable/);
});

// ---------- #552: a rename the run is about to record ----------
//
// A slug rename is breaking only when the old slug stops resolving. The identity
// ledger makes it resolve, but the verdict can only use that when it is handed
// the rename this run is ABOUT TO record: the committed ledger cannot contain it
// yet, and a breaking verdict opens no PR, so a run that waited for the ledger to
// be committed would re-detect the same rename every night forever.

function registryWith(slug, entry) {
  var comps = {};
  comps[slug] = entry;
  return { library: "ds", components: comps };
}

test("a slug rename is breaking when nothing records where the slug went", function () {
  var before = registryWith("sticky-footer", { name: "Sticky footer", key: "K1" });
  var after = registryWith("action-bar", { name: "Action bar", key: "K1" });

  var verdict = classifier({ fileKind: "registry", before: before, after: after });
  assert.equal(verdict.category, "breaking");
});

test("a slug rename is additive when the run records where the slug went", function () {
  var before = registryWith("sticky-footer", { name: "Sticky footer", key: "K1" });
  var after = registryWith("action-bar", { name: "Action bar", key: "K1" });

  var verdict = classifier({
    fileKind: "registry",
    before: before,
    after: after,
    absorbedRenames: { "sticky-footer": "action-bar" },
  });
  assert.equal(verdict.category, "additive");
  assert.deepEqual(verdict.reasons, []);
});

test("absorption is checked by TARGET, so a ledger naming the wrong successor stays breaking", function () {
  var before = registryWith("sticky-footer", { name: "Sticky footer", key: "K1" });
  var after = registryWith("action-bar", { name: "Action bar", key: "K1" });

  // The old slug resolves, but to a DIFFERENT component. Treating "present in
  // the index" as absorption would launder a real break into an auto-merge.
  var verdict = classifier({
    fileKind: "registry",
    before: before,
    after: after,
    absorbedRenames: { "sticky-footer": "some-other-component" },
  });
  assert.equal(verdict.category, "breaking");
});

test("absorption does not excuse a removal that happens alongside it", function () {
  var before = {
    library: "ds",
    components: {
      "sticky-footer": { name: "Sticky footer", key: "K1" },
      "alert-inline": { name: "Alert-inline", key: "K2" },
    },
  };
  var after = { library: "ds", components: { "action-bar": { name: "Action bar", key: "K1" } } };

  var verdict = classifier({
    fileKind: "registry",
    before: before,
    after: after,
    absorbedRenames: { "sticky-footer": "action-bar" },
  });
  assert.equal(verdict.category, "breaking");
  assert.ok(
    verdict.reasons.some(function (r) {
      return /removed component/.test(r);
    }),
    "the removal must still be reported: " + JSON.stringify(verdict.reasons),
  );
});
