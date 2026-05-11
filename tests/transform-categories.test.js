"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var mod = require(
  path.join(
    __dirname,
    "..",
    "scripts",
    "transformers",
    "transform-categories.js",
  ),
);
var inferCategoryMap = mod.inferCategoryMap;

// Helpers for building synthetic document children
function canvas(name) {
  return { type: "CANVAS", name: name };
}
function nonCanvas(name) {
  return { type: "FRAME", name: name };
}

// A realistic minimal fixture mirroring the probe output's shape.
function fullFixture() {
  return [
    canvas("Cover"),
    canvas("💎 FOUNDATIONS"),
    canvas("✅ Borders"),
    canvas("----"),
    canvas("🧱 COMPONENTS"),
    canvas("Action"),
    canvas("     ✍️ Button"),
    canvas("     ✅ Link"),
    canvas("     ✅ Sticky footer"),
    canvas("Form (input & selection)"),
    canvas("     ✅ Calendar"),
    canvas("     ✅ Checkbox"),
    canvas("Navigation "),
    canvas("     ✅ Breadcrumbs"),
    canvas("     ✍️  Side nav"),
    canvas("Data Display"),
    canvas("     ✅ Avatar"),
    canvas("Feedback"),
    canvas("     ✍️ Alert (banner)"),
    canvas("Overlays"),
    canvas("     ⛔️ Popover"),
    canvas("     ⚠️ Tooltip"),
    canvas("---"),
    canvas("🎨 BRAND ASSETS"),
    canvas("Marketing icons"),
  ];
}

test("transform-categories — happy path: full fixture maps members correctly", function () {
  var result = inferCategoryMap(fullFixture());

  assert.equal(result.map["Button"].category, "Action");
  assert.equal(result.map["Button"].status, "in-progress");
  assert.equal(result.map["Link"].category, "Action");
  assert.equal(result.map["Link"].status, null);
  assert.equal(result.map["Calendar"].category, "Form (input & selection)");
  assert.equal(result.map["Calendar"].status, null);
  assert.equal(result.map["Side nav"].category, "Navigation");
  assert.equal(result.map["Side nav"].status, "in-progress");
  assert.equal(result.map["Popover"].category, "Overlays");
  assert.equal(result.map["Popover"].status, "deprecated");
  assert.equal(result.map["Tooltip"].category, "Overlays");
  assert.equal(result.map["Tooltip"].status, "warn");

  // Outside COMPONENTS: foundations pages stored with null category
  // (key includes the emoji prefix since they aren't member pages)
  assert.equal(result.map["✅ Borders"]?.category ?? null, null);
  assert.equal(result.map["Marketing icons"]?.category ?? null, null);

  // No warnings on happy path (all 6 known categories present + recognized)
  assert.equal(result.warnings.length, 0);
});

test("transform-categories — unknown category emits warning", function () {
  var children = [
    canvas("🧱 COMPONENTS"),
    canvas("Action"),
    canvas("     ✅ Button"),
    canvas("Custom Family"),
    canvas("     ✅ Mystery widget"),
    canvas("Form (input & selection)"),
    canvas("Navigation"),
    canvas("Data Display"),
    canvas("Feedback"),
    canvas("Overlays"),
  ];
  var result = inferCategoryMap(children);

  var unknown = result.warnings.find(function (w) {
    return w.code === "UNKNOWN_CATEGORY";
  });
  assert.ok(unknown, "UNKNOWN_CATEGORY warning emitted");
  assert.equal(unknown.category, "Custom Family");
  assert.deepEqual(unknown.members, ["Mystery widget"]);

  assert.equal(result.map["Mystery widget"].category, "Custom Family");
});

test("transform-categories — renamed known category triggers two warnings", function () {
  var children = [
    canvas("🧱 COMPONENTS"),
    canvas("Actions"), // Renamed from Action
    canvas("     ✅ Button"),
    canvas("Form (input & selection)"),
    canvas("Navigation"),
    canvas("Data Display"),
    canvas("Feedback"),
    canvas("Overlays"),
  ];
  var result = inferCategoryMap(children);

  var unknown = result.warnings.find(function (w) {
    return w.code === "UNKNOWN_CATEGORY" && w.category === "Actions";
  });
  var missing = result.warnings.find(function (w) {
    return w.code === "MISSING_KNOWN_CATEGORY" && w.category === "Action";
  });
  assert.ok(unknown, "UNKNOWN_CATEGORY for Actions");
  assert.ok(missing, "MISSING_KNOWN_CATEGORY for Action");
  assert.equal(result.map["Button"].category, "Actions");
});

test("transform-categories — missing known category warns", function () {
  var children = [
    canvas("🧱 COMPONENTS"),
    canvas("Action"),
    canvas("Form (input & selection)"),
    canvas("Navigation"),
    canvas("Data Display"),
    canvas("Overlays"),
  ];
  var result = inferCategoryMap(children);

  var missing = result.warnings.find(function (w) {
    return w.code === "MISSING_KNOWN_CATEGORY" && w.category === "Feedback";
  });
  assert.ok(missing, "Feedback missing");
});

test("transform-categories — member before any header → MEMBER_WITHOUT_CATEGORY", function () {
  var children = [
    canvas("🧱 COMPONENTS"),
    canvas("     ✅ Orphan"),
    canvas("Action"),
    canvas("Form (input & selection)"),
    canvas("Navigation"),
    canvas("Data Display"),
    canvas("Feedback"),
    canvas("Overlays"),
  ];
  var result = inferCategoryMap(children);

  assert.equal(result.map["Orphan"].category, null);
  var w = result.warnings.find(function (w) {
    return w.code === "MEMBER_WITHOUT_CATEGORY";
  });
  assert.ok(w, "MEMBER_WITHOUT_CATEGORY emitted");
});

test("transform-categories — pages outside COMPONENTS get null category, no warning", function () {
  var children = [
    canvas("💎 FOUNDATIONS"),
    canvas("✅ Color"),
    canvas("🧱 COMPONENTS"),
    canvas("Action"),
    canvas("     ✅ Button"),
    canvas("Form (input & selection)"),
    canvas("Navigation"),
    canvas("Data Display"),
    canvas("Feedback"),
    canvas("Overlays"),
    canvas("🎨 BRAND ASSETS"),
    canvas("Marketing icons"),
  ];
  var result = inferCategoryMap(children);

  assert.equal(result.map["✅ Color"]?.category ?? null, null);
  assert.equal(result.map["Marketing icons"]?.category ?? null, null);
  var memberWithoutCat = result.warnings.filter(function (w) {
    return w.code === "MEMBER_WITHOUT_CATEGORY";
  });
  assert.equal(memberWithoutCat.length, 0);
});

test("transform-categories — multiple separators reset category", function () {
  var children = [
    canvas("🧱 COMPONENTS"),
    canvas("Action"),
    canvas("     ✅ Button"),
    canvas("---"),
    canvas("----"),
    canvas("     ✅ Floating"),
    canvas("Form (input & selection)"),
    canvas("Navigation"),
    canvas("Data Display"),
    canvas("Feedback"),
    canvas("Overlays"),
  ];
  var result = inferCategoryMap(children);

  assert.equal(result.map["Button"].category, "Action");
  assert.equal(result.map["Floating"].category, null);
  var w = result.warnings.find(function (w) {
    return w.code === "MEMBER_WITHOUT_CATEGORY";
  });
  assert.ok(w, "MEMBER_WITHOUT_CATEGORY for Floating");
});

test("transform-categories — trailing whitespace + double-space after emoji tolerated", function () {
  var children = [
    canvas("🧱 COMPONENTS"),
    canvas("Navigation "),
    canvas("     ✍️  Side nav"),
    canvas("Action"),
    canvas("Form (input & selection)"),
    canvas("Data Display"),
    canvas("Feedback"),
    canvas("Overlays"),
  ];
  var result = inferCategoryMap(children);

  assert.equal(result.map["Side nav"].category, "Navigation");
  assert.equal(result.map["Side nav"].status, "in-progress");
});

test("transform-categories — empty input returns empty map + 6 missing warnings", function () {
  var result = inferCategoryMap([]);
  assert.deepEqual(result.map, {});
  assert.equal(
    result.warnings.filter(function (w) {
      return w.code === "MISSING_KNOWN_CATEGORY";
    }).length,
    6,
  );
});

test("transform-categories — status emoji variants all parse correctly", function () {
  var children = [
    canvas("🧱 COMPONENTS"),
    canvas("Action"),
    canvas("     ✅ Curated"),
    canvas("     ✍️ InProg"),
    canvas("     ⛔️ Deprecated"),
    canvas("     ⚠️ Warn"),
    canvas("Form (input & selection)"),
    canvas("Navigation"),
    canvas("Data Display"),
    canvas("Feedback"),
    canvas("Overlays"),
  ];
  var result = inferCategoryMap(children);

  assert.equal(result.map["Curated"].status, null);
  assert.equal(result.map["InProg"].status, "in-progress");
  assert.equal(result.map["Deprecated"].status, "deprecated");
  assert.equal(result.map["Warn"].status, "warn");
});

test("transform-categories — non-CANVAS children are skipped", function () {
  var children = [
    nonCanvas("Should be ignored"),
    canvas("🧱 COMPONENTS"),
    canvas("Action"),
    canvas("     ✅ Button"),
    canvas("Form (input & selection)"),
    canvas("Navigation"),
    canvas("Data Display"),
    canvas("Feedback"),
    canvas("Overlays"),
  ];
  var result = inferCategoryMap(children);
  assert.equal(result.map["Should be ignored"], undefined);
  assert.equal(result.map["Button"].category, "Action");
});

var buildCategoriesArtifact = mod.buildCategoriesArtifact;

test("buildCategoriesArtifact — groups by category, sorts slugs, counts uncategorized", function () {
  var registry = {
    library: "ds",
    components: {
      "z-button": { category: "Action" },
      "a-button": { category: "Action" },
      checkbox: { category: "Form (input & selection)" },
      icon: { category: null },
      "icon-2": {},
    },
  };
  var artifact = buildCategoriesArtifact(registry);

  assert.equal(artifact.library, "ds");
  assert.ok(artifact.generatedAt.match(/^\d{4}-\d{2}-\d{2}T/));
  assert.deepEqual(artifact.categories["Action"].components, [
    "a-button",
    "z-button",
  ]);
  assert.equal(artifact.categories["Action"].count, 2);
  assert.deepEqual(artifact.categories["Form (input & selection)"].components, [
    "checkbox",
  ]);
  assert.equal(artifact.uncategorized.count, 2);
});

test("buildCategoriesArtifact — empty registry returns empty categories + 0 uncategorized", function () {
  var artifact = buildCategoriesArtifact({ library: "ds", components: {} });
  assert.deepEqual(artifact.categories, {});
  assert.equal(artifact.uncategorized.count, 0);
});

test("_isTopLevelMarker — emoji + ALL CAPS multi-letter word matches", function () {
  assert.equal(mod._isTopLevelMarker("🧱 COMPONENTS"), true);
  assert.equal(mod._isTopLevelMarker("💎 FOUNDATIONS"), true);
  assert.equal(mod._isTopLevelMarker("🎨 BRAND ASSETS"), true);
});

test("_isTopLevelMarker — single-word all-caps without emoji is NOT a marker", function () {
  assert.equal(mod._isTopLevelMarker("FORMS"), false);
  assert.equal(mod._isTopLevelMarker("COMPONENTS"), false);
});

test("_isTopLevelMarker — Title Case names are NOT markers", function () {
  assert.equal(mod._isTopLevelMarker("Action"), false);
  assert.equal(mod._isTopLevelMarker("Data Display"), false);
});

test("_isCategoryHeader — Title Case names with no emoji + no indent ARE headers", function () {
  assert.equal(mod._isCategoryHeader("Action"), true);
  assert.equal(mod._isCategoryHeader("Form (input & selection)"), true);
  assert.equal(mod._isCategoryHeader("Data Display"), true);
});

test("_isCategoryHeader — all-caps name is NOT a category header", function () {
  assert.equal(mod._isCategoryHeader("DATA DISPLAY"), false);
});

test("_isCategoryHeader — leading whitespace disqualifies", function () {
  assert.equal(mod._isCategoryHeader("     Action"), false);
});

test("_isCategoryHeader — status emoji prefix disqualifies", function () {
  assert.equal(mod._isCategoryHeader("✅ Action"), false);
  assert.equal(mod._isCategoryHeader("✍️ Button"), false);
});

test("_isCategoryHeader — separator is NOT a category header", function () {
  assert.equal(mod._isCategoryHeader("---"), false);
});

test("_isSeparator — only dashes returns true", function () {
  assert.equal(mod._isSeparator("---"), true);
  assert.equal(mod._isSeparator("----"), true);
  assert.equal(mod._isSeparator("Action"), false);
  assert.equal(mod._isSeparator(""), false);
});

var transformRegistry = require(
  path.join(
    __dirname,
    "..",
    "scripts",
    "transformers",
    "transform-registry.js",
  ),
);

test("transform-registry — applies category + status from documentChildren", function () {
  var componentSets = [
    {
      name: "Button",
      key: "k-button",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✍️ Button" },
    },
    {
      name: "Calendar",
      key: "k-calendar",
      node_id: "1:2",
      description: "",
      containing_frame: { pageName: "✅ Calendar" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
    "1:2": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "     ✍️ Button" },
    { type: "CANVAS", name: "Form (input & selection)" },
    { type: "CANVAS", name: "     ✅ Calendar" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
  });

  assert.equal(registry.components["button"].category, "Action");
  assert.equal(registry.components["button"].status, "in-progress");
  assert.equal(
    registry.components["calendar"].category,
    "Form (input & selection)",
  );
  // ✅ → status field absent
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      registry.components["calendar"],
      "status",
    ),
    false,
    "✅ pages have no status field",
  );
});

test("transform-registry — without documentChildren, no category/status fields added", function () {
  var componentSets = [
    {
      name: "Button",
      key: "k-button",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✍️ Button" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    // documentChildren omitted
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      registry.components["button"],
      "category",
    ),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      registry.components["button"],
      "status",
    ),
    false,
  );
});

test("transform-registry — component not in map gets no category/status (miss path)", function () {
  // documentChildren supplied, but "Icon" is not a member page in it.
  // Lookup returns null; buildEntry skips category + status entirely.
  var componentSets = [
    {
      name: "Icon",
      key: "k-icon",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "Icon" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "     ✅ Button" },
    { type: "CANVAS", name: "Form (input & selection)" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      registry.components["icon"],
      "category",
    ),
    false,
    "component absent from map gets no category",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(registry.components["icon"], "status"),
    false,
    "component absent from map gets no status",
  );
});
