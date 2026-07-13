"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var transformRegistry = require("../scripts/transformers/transform-registry.js");
var sync = require("../scripts/sync/sync-from-figma.js");

// ---------------------------------------------------------------------------
// Regression gate for the class of loss that ate the `calendar` icon (2026-07-13).
//
// registry.components is keyed by SLUG. When a standalone and a component set
// slugify to the same string, the set wins and the standalone is dropped — that
// policy is fine. Dropping it SILENTLY was the bug: the standalone does not lose
// a name, it disappears from the design system, with no error, no diff line, and
// nothing in the sync PR.
//
// It is invisible everywhere else, too. detectSlugCollisions (scripts/graph/
// derive-graph.js) reads the already-slug-keyed `components` map, so by the time
// it runs the loser is gone; it can only ever see CROSS-KIT collisions. The
// transform is the only place this can be named, so it must name it.
//
// Real case: the Calendar COMPONENT (a set, page "✅ Calendar") owns the slug
// `calendar`. The 2026-07 icon rework renamed the calendar glyph from
// `calendar-2` to `calendar` — straight onto that collision — so the icon was
// dropped and `renderIcon("calendar-2")` in the plugin had nothing to resolve.
// The old `calendar-2` name almost certainly existed to dodge exactly this.
// ---------------------------------------------------------------------------

function build() {
  var componentSets = [
    {
      name: "Calendar",
      key: "k-calendar-component",
      node_id: "8211:6664",
      description: "",
      containing_frame: { pageName: "✅ Calendar" },
    },
  ];
  var standalones = [
    {
      // The ICON. Slugifies to "calendar" — same as the component set above.
      name: "calendar",
      key: "k-calendar-icon",
      node_id: "7378:5041",
      description: "",
      containing_frame: { pageName: "✍️ DS Icons: replacement" },
    },
    {
      // A standalone that collides with nothing: must survive untouched.
      name: "simple-check",
      key: "k-simple-check",
      node_id: "7271:6256",
      description: "",
      containing_frame: { pageName: "✍️ DS Icons: replacement" },
    },
  ];
  var warnings = [];
  var registry = transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: componentSets,
    componentSetNodes: {
      "8211:6664": { document: { componentPropertyDefinitions: {} } },
    },
    standalones: standalones,
    standaloneNodes: {
      "7378:5041": { document: { componentPropertyDefinitions: {} } },
      "7271:6256": { document: { componentPropertyDefinitions: {} } },
    },
    documentChildren: [
      { type: "CANVAS", name: "🧱 COMPONENTS" },
      { type: "CANVAS", name: "Form (input & selection)" },
      { type: "CANVAS", name: "     ✅ Calendar" },
      { type: "CANVAS", name: "Icons" },
      { type: "CANVAS", name: "     ✍️ DS Icons: replacement" },
    ],
    onWarnings: function (ws) {
      warnings = warnings.concat(ws || []);
    },
  });
  return { registry: registry, warnings: warnings };
}

test("slug collision: the component set still wins (policy unchanged)", function () {
  var b = build();
  assert.equal(b.registry.components["calendar"].name, "Calendar");
  assert.equal(b.registry.components["calendar"].nodeId, "8211:6664");
});

test("slug collision: the dropped standalone is NAMED, not swallowed", function () {
  var b = build();
  var hits = b.warnings.filter(function (w) {
    return w.code === "SLUG_COLLISION_DROPPED";
  });
  assert.equal(hits.length, 1, "expected exactly one collision warning");
  var w = hits[0];
  assert.equal(w.slug, "calendar");
  // Both sides, with node ids: enough to open the two nodes in Figma and rename
  // one without any further digging.
  assert.equal(w.droppedName, "calendar");
  assert.equal(w.droppedNodeId, "7378:5041");
  assert.equal(w.keptName, "Calendar");
  assert.equal(w.keptNodeId, "8211:6664");
});

test("slug collision: a non-colliding standalone is untouched and warns nothing", function () {
  var b = build();
  assert.equal(b.registry.components["simple-check"].nodeId, "7271:6256");
  var collidedSlugs = b.warnings
    .filter(function (w) {
      return w.code === "SLUG_COLLISION_DROPPED";
    })
    .map(function (w) {
      return w.slug;
    });
  assert.ok(
    collidedSlugs.indexOf("simple-check") === -1,
    "simple-check must not be reported as collided",
  );
});

// Set-vs-set: the OTHER half of the same bug. That loop has no guard at all — it
// just assigns — so two sets that slugify alike lose one of themselves exactly as
// silently. Behaviour is deliberately preserved (last write wins): a tripwire must
// not quietly rewrite the substrate it is watching. Same loss, same alarm, zero
// behaviour change.
test("slug collision: two component SETS collide — the loss is named, and the winner does not change", function () {
  var warnings = [];
  var registry = transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: [
      {
        name: "Tag",
        key: "k-tag-first",
        node_id: "1:1",
        description: "",
        containing_frame: { pageName: "✍️ Tag" },
      },
      {
        // Slugifies to "tag" as well — a duplicate/leftover set.
        name: "tag",
        key: "k-tag-second",
        node_id: "2:2",
        description: "",
        containing_frame: { pageName: "✍️ Tag" },
      },
    ],
    componentSetNodes: {
      "1:1": { document: { componentPropertyDefinitions: {} } },
      "2:2": { document: { componentPropertyDefinitions: {} } },
    },
    standalones: [],
    standaloneNodes: {},
    documentChildren: [
      { type: "CANVAS", name: "🧱 COMPONENTS" },
      { type: "CANVAS", name: "Data Display" },
      { type: "CANVAS", name: "     ✍️ Tag" },
    ],
    onWarnings: function (ws) {
      warnings = warnings.concat(ws || []);
    },
  });

  // Behaviour unchanged: last write still wins.
  assert.equal(registry.components["tag"].nodeId, "2:2");

  var hits = warnings.filter(function (w) {
    return w.code === "SLUG_COLLISION_DROPPED";
  });
  assert.equal(hits.length, 1, "the set-vs-set loss must be named");
  // The OVERWRITTEN node is the one that disappears, so it is the dropped side.
  assert.equal(hits[0].slug, "tag");
  assert.equal(hits[0].droppedNodeId, "1:1");
  assert.equal(hits[0].keptNodeId, "2:2");
});

// ---------------------------------------------------------------------------
// FALSE-ALARM GUARDS. "A false alarm is worse than no alarm": an alarm that
// fires on components that were never going to publish trains the reader to
// skim past the section that exists to catch a real loss. A standalone is only
// a collision CASUALTY if it would OTHERWISE have been published.
// ---------------------------------------------------------------------------

test("false alarm: a standalone dropped by the publish gate is not reported as a collision", function () {
  var warnings = [];
  transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: [
      {
        name: "Button",
        key: "k-button",
        node_id: "1:1",
        description: "",
        containing_frame: { pageName: "✍️ Button" },
      },
    ],
    componentSetNodes: {
      "1:1": { document: { componentPropertyDefinitions: {} } },
    },
    standalones: [
      {
        // Same slug as the Button set, but sitting directly on the category
        // HEADER page — the publish gate drops it regardless of any collision.
        name: "Button",
        key: "k-button-dupe",
        node_id: "9:9",
        description: "",
        containing_frame: { pageName: "Action" },
      },
    ],
    standaloneNodes: {
      "9:9": { document: { componentPropertyDefinitions: {} } },
    },
    documentChildren: [
      { type: "CANVAS", name: "🧱 COMPONENTS" },
      { type: "CANVAS", name: "Action" },
      { type: "CANVAS", name: "     ✍️ Button" },
    ],
    onWarnings: function (ws) {
      warnings = warnings.concat(ws || []);
    },
  });
  assert.deepEqual(
    warnings.filter(function (w) {
      return w.code === "SLUG_COLLISION_DROPPED";
    }),
    [],
    "publish-gate drop must not masquerade as a collision casualty",
  );
});

test("false alarm: a collision on a DENIED scratch page is suppressed at the sync layer", function () {
  // transformRegistry reports every collision honestly — it cannot know about
  // DENIED_PAGES, which is a sync-level concept — so the suppression lives in
  // sync-from-figma and is asserted there.
  var raw = [
    {
      code: "SLUG_COLLISION_DROPPED",
      slug: "button",
      droppedName: "Button",
      droppedNodeId: "9:9",
      droppedPage: "Local components",
      droppedPageRaw: "Local components",
      keptName: "Button",
      keptNodeId: "1:1",
    },
    {
      code: "SLUG_COLLISION_DROPPED",
      slug: "calendar",
      droppedName: "calendar",
      droppedNodeId: "7378:5041",
      droppedPage: "DS Icons: replacement",
      droppedPageRaw: "✍️ DS Icons: replacement",
      keptName: "Calendar",
      keptNodeId: "8211:6664",
    },
    { code: "MEMBER_WITHOUT_CATEGORY", page: "Forms" },
  ];
  var out = sync.suppressDeniedPageCollisions(raw, sync.DENIED_PAGES);
  var collisions = out.filter(function (w) {
    return w.code === "SLUG_COLLISION_DROPPED";
  });
  assert.equal(
    collisions.length,
    1,
    "the scratch-page collision is suppressed",
  );
  assert.equal(collisions[0].slug, "calendar", "the REAL loss still fires");
  assert.ok(
    out.some(function (w) {
      return w.code === "MEMBER_WITHOUT_CATEGORY";
    }),
    "unrelated warnings pass through untouched",
  );
});

test("no collision: a clean registry emits no collision warnings at all", function () {
  var warnings = [];
  transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: [
      {
        name: "Button",
        key: "k-button",
        node_id: "1:1",
        description: "",
        containing_frame: { pageName: "✍️ Button" },
      },
    ],
    componentSetNodes: {
      "1:1": { document: { componentPropertyDefinitions: {} } },
    },
    standalones: [
      {
        name: "simple-check",
        key: "k-simple-check",
        node_id: "2:1",
        description: "",
        containing_frame: { pageName: "✍️ DS Icons: replacement" },
      },
    ],
    standaloneNodes: {
      "2:1": { document: { componentPropertyDefinitions: {} } },
    },
    documentChildren: [
      { type: "CANVAS", name: "🧱 COMPONENTS" },
      { type: "CANVAS", name: "Action" },
      { type: "CANVAS", name: "     ✍️ Button" },
      { type: "CANVAS", name: "Icons" },
      { type: "CANVAS", name: "     ✍️ DS Icons: replacement" },
    ],
    onWarnings: function (ws) {
      warnings = warnings.concat(ws || []);
    },
  });
  assert.deepEqual(
    warnings.filter(function (w) {
      return w.code === "SLUG_COLLISION_DROPPED";
    }),
    [],
  );
});
