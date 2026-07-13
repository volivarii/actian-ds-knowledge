"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var transformRegistry = require("../scripts/transformers/transform-registry.js");

// ---------------------------------------------------------------------------
// A component that resolves to NO category falls out of everything downstream
// that keys off category — categories.json, the docs site's page tree, the
// graph's in_category edges — and it did so in TOTAL SILENCE.
// assertNoCategoryMassLoss only fires when a whole category is GUTTED (>= 10
// members -> 0), so exactly one component slipping out is invisible to it.
//
// The real case (2026-07-13): `toggle`. Its Figma page was renamed
// `Toggle control` -> `Toggle` on the canvas, but the library was NOT
// republished. Category inference reads the LIVE document tree (which said
// `Toggle`), while each component's page name comes from PUBLISHED metadata
// (which still said `Toggle control`). The two never matched, toggle lost its
// category, and the docs site stopped generating a page for it — with nothing
// anywhere saying so. This is the alarm for that.
// ---------------------------------------------------------------------------

// The exact shape of the toggle failure: the live tree carries the NEW page name,
// the component's published metadata still carries the OLD one.
function buildRenamedWithoutRepublish() {
  var warnings = [];
  var registry = transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: [
      {
        name: "Checkbox",
        key: "k-checkbox",
        node_id: "1:1",
        description: "",
        containing_frame: { pageName: "✍️ Checkbox" },
      },
      {
        name: "Toggle",
        key: "k-toggle",
        node_id: "14000:4395",
        description: "",
        // PUBLISHED metadata — stale, still the pre-rename page name.
        containing_frame: { pageName: "✍️ Toggle control" },
      },
    ],
    componentSetNodes: {
      "1:1": { document: { componentPropertyDefinitions: {} } },
      "14000:4395": { document: { componentPropertyDefinitions: {} } },
    },
    standalones: [],
    standaloneNodes: {},
    // LIVE document tree — already carries the renamed page.
    documentChildren: [
      { type: "CANVAS", name: "🧱 COMPONENTS" },
      { type: "CANVAS", name: "Form (input & selection)" },
      { type: "CANVAS", name: "     ✍️ Checkbox" },
      { type: "CANVAS", name: "     ✍️ Toggle" },
    ],
    onWarnings: function (ws) {
      warnings = warnings.concat(ws || []);
    },
  });
  return { registry: registry, warnings: warnings };
}

test("uncategorized: a page renamed without republishing strips the category — and it is NAMED", function () {
  var b = buildRenamedWithoutRepublish();

  // The failure itself: toggle is in the registry but has no category.
  assert.equal(b.registry.components["toggle"].category, undefined);
  // Its unaffected sibling still resolves, proving inference itself works.
  assert.equal(
    b.registry.components["checkbox"].category,
    "Form (input & selection)",
  );

  var hits = b.warnings.filter(function (w) {
    return w.code === "COMPONENT_WITHOUT_CATEGORY";
  });
  assert.equal(hits.length, 1, "the silent drop-out must be named");
  assert.equal(hits[0].component, "toggle");
  assert.equal(hits[0].name, "Toggle");
  // The published page name is the diagnosis: it is what failed to match.
  assert.equal(hits[0].page, "✍️ Toggle control");
});

test("uncategorized: a fully categorized kit emits no warning", function () {
  var warnings = [];
  transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: [
      {
        name: "Checkbox",
        key: "k-checkbox",
        node_id: "1:1",
        description: "",
        containing_frame: { pageName: "✍️ Checkbox" },
      },
    ],
    componentSetNodes: {
      "1:1": { document: { componentPropertyDefinitions: {} } },
    },
    standalones: [],
    standaloneNodes: {},
    documentChildren: [
      { type: "CANVAS", name: "🧱 COMPONENTS" },
      { type: "CANVAS", name: "Form (input & selection)" },
      { type: "CANVAS", name: "     ✍️ Checkbox" },
    ],
    onWarnings: function (ws) {
      warnings = warnings.concat(ws || []);
    },
  });
  assert.deepEqual(
    warnings.filter(function (w) {
      return w.code === "COMPONENT_WITHOUT_CATEGORY";
    }),
    [],
  );
});

// The noise guard. FM Kit and Meta Kit have NO page-category structure — they
// never pass documentChildren, so every one of their components is legitimately
// category-less (287 + 28 of them). Warning there would bury the one that matters
// under 315 lines of noise, which is how a real alarm becomes wallpaper.
test("uncategorized: a kit with no category structure at all (FM/Meta) stays silent", function () {
  var warnings = [];
  var registry = transformRegistry({
    library: "fm",
    fileKey: "test-key",
    componentSets: [
      {
        name: "FM Button",
        key: "k-fm-button",
        node_id: "1:1",
        description: "",
        containing_frame: { pageName: "Fat Marker Kit" },
      },
    ],
    componentSetNodes: {
      "1:1": { document: { componentPropertyDefinitions: {} } },
    },
    standalones: [],
    standaloneNodes: {},
    documentChildren: null, // FM/Meta Kit never pass this
    onWarnings: function (ws) {
      warnings = warnings.concat(ws || []);
    },
  });
  assert.equal(registry.components["fm-button"].category, undefined);
  assert.deepEqual(
    warnings.filter(function (w) {
      return w.code === "COMPONENT_WITHOUT_CATEGORY";
    }),
    [],
    "no category structure means category-less is CORRECT, not a defect",
  );
});
