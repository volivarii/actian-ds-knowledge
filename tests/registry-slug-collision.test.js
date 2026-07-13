"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var transformRegistry = require("../scripts/transformers/transform-registry.js");

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
