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
    canvas("Form"),
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
  assert.equal(result.map["Calendar"].category, "Form");
  assert.equal(result.map["Calendar"].status, null);
  assert.equal(result.map["Side nav"].category, "Navigation");
  assert.equal(result.map["Side nav"].status, "in-progress");
  assert.equal(result.map["Popover"].category, "Overlays");
  assert.equal(result.map["Popover"].status, "deprecated");
  assert.equal(result.map["Tooltip"].category, "Overlays");
  assert.equal(result.map["Tooltip"].status, "warn");

  // ζ.2 (2026-05-13): non-COMPONENTS pages now ALSO get a populated
  // `category` (= page clean-name) + `section` (= top-level marker).
  // Map keys are clean-names (emoji stripped) for consistency with member
  // pages. Previously `category: null` for these — leaving 234 icons +
  // brand items uncategorized in docs sidebar IA.
  assert.equal(result.map["Borders"].category, "Borders");
  assert.equal(result.map["Borders"].section, "Foundations");
  assert.equal(result.map["Marketing icons"].category, "Marketing icons");
  assert.equal(result.map["Marketing icons"].section, "Brand Assets");

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
    canvas("Form"),
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
    canvas("Form"),
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
    canvas("Form"),
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
    canvas("Form"),
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

test("transform-categories — non-COMPONENTS pages get section + category (ζ.2)", function () {
  // ζ.2 (2026-05-13): previously these pages got `category: null` and
  // were essentially dropped from docs IA. Now they receive section
  // (top-level marker) + category (= page clean-name) so consumers can
  // render Foundations/Brand items alongside Components items.
  var children = [
    canvas("💎 FOUNDATIONS"),
    canvas("✅ Color"),
    canvas("🧱 COMPONENTS"),
    canvas("Action"),
    canvas("     ✅ Button"),
    canvas("Form"),
    canvas("Navigation"),
    canvas("Data Display"),
    canvas("Feedback"),
    canvas("Overlays"),
    canvas("🎨 BRAND ASSETS"),
    canvas("Marketing icons"),
  ];
  var result = inferCategoryMap(children);

  // Foundations page — clean-name key, section + category populated.
  assert.equal(result.map["Color"].section, "Foundations");
  assert.equal(result.map["Color"].category, "Color");
  assert.equal(result.map["Color"].status, null);

  // Brand page — no emoji to strip; section + category populated.
  assert.equal(result.map["Marketing icons"].section, "Brand Assets");
  assert.equal(result.map["Marketing icons"].category, "Marketing icons");

  // Components items keep their existing semantic (additive change).
  assert.equal(result.map["Button"].section, "Components");
  assert.equal(result.map["Button"].category, "Action");

  // No MEMBER_WITHOUT_CATEGORY for non-COMPONENTS items — they're not
  // member pages in the first place.
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
    canvas("Form"),
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
    canvas("Form"),
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
    canvas("Form"),
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
    canvas("Form"),
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
      checkbox: { category: "Form" },
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
  assert.deepEqual(artifact.categories["Form"].components, [
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
  assert.equal(mod._isCategoryHeader("Form"), true);
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

test("transform-registry — applies category from documentChildren; the page no longer sets status", function () {
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
    { type: "CANVAS", name: "Form" },
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
  // Status is authored on the COMPONENT now, so a page emoji sets nothing.
  assert.equal(registry.components["button"].status, undefined);
  assert.equal(
    registry.components["calendar"].category,
    "Form",
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
    { type: "CANVAS", name: "Form" },
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

test("transform-registry — multiple components on the same page share the page's category", function () {
  // Simulate a page like "✍️ Tag (Identification key)" with 3 components on it
  var componentSets = [
    {
      name: "Tag, read only",
      key: "k-tag-d",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✍️ Tag (Identification key)" },
    },
    {
      name: "Tag interactive",
      key: "k-tag-i",
      node_id: "1:2",
      description: "",
      containing_frame: { pageName: "✍️ Tag (Identification key)" },
    },
    {
      name: "Tag status",
      key: "k-tag-s",
      node_id: "1:3",
      description: "",
      containing_frame: { pageName: "✍️ Tag (Identification key)" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
    "1:2": { document: { componentPropertyDefinitions: {} } },
    "1:3": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "     ✍️ Tag (Identification key)" },
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

  assert.equal(registry.components["tag-read-only"].category, "Data Display");
  assert.equal(registry.components["tag-read-only"].status, undefined);
  assert.equal(registry.components["tag-interactive"].category, "Data Display");
  assert.equal(registry.components["tag-interactive"].status, undefined);
  assert.equal(registry.components["tag-status"].category, "Data Display");
  assert.equal(registry.components["tag-status"].status, undefined);
});

// ---- ζ.1 (2026-05-13): registry hygiene ----

test("transform-registry — entries omit per-component lastSynced field", function () {
  // ζ.1 removed `lastSynced` from each component entry (ecosystem audit
  // found zero consumers; classifier already ignored it). Registry-level
  // `lastSynced` is kept.
  var componentSets = [
    {
      name: "Button",
      key: "k-button",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✅ Button" },
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
  });

  assert.ok(registry.lastSynced, "registry-level lastSynced still present");
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      registry.components["button"],
      "lastSynced",
    ),
    false,
    "per-component lastSynced removed",
  );
});

test("transform-registry — exposes documentationLinks from node document", function () {
  var componentSets = [
    {
      name: "Card",
      key: "k-card",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✅ Card" },
    },
    {
      name: "Modal",
      key: "k-modal",
      node_id: "1:2",
      description: "",
      containing_frame: { pageName: "✅ Modal" },
    },
  ];
  var componentSetNodes = {
    "1:1": {
      document: {
        componentPropertyDefinitions: {},
        documentationLinks: [{ uri: "https://docs.actian.com/card" }],
      },
    },
    "1:2": {
      // No documentationLinks in node — should fall back to empty array.
      document: { componentPropertyDefinitions: {} },
    },
  };

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
  });

  assert.deepEqual(registry.components["card"].documentationLinks, [
    { uri: "https://docs.actian.com/card" },
  ]);
  assert.deepEqual(
    registry.components["modal"].documentationLinks,
    [],
    "missing documentationLinks falls back to empty array",
  );
});

test("transform-registry — guidelinesFile field is not emitted (retired Phase 5)", function () {
  // Phase 5 (knowledge v0.11.0): guidelinesSlugSet input + guidelinesFile
  // output were retired with the scraped components/src/guidelines/ layer.
  // Consumers now resolve per-component guideline docs by slug via the
  // components.guidelineDoc collection in paths-manifest.json. The
  // transformer no longer accepts guidelinesSlugSet and never emits a
  // guidelinesFile field on registry entries.
  var componentSets = [
    {
      name: "Button",
      key: "k-button",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✅ Button" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };

  // Pass guidelinesSlugSet anyway — transformer must IGNORE it.
  var registry = transformRegistry({
    library: "ds",
    fileKey: "test-key",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    guidelinesSlugSet: new Set(["button"]),
  });

  assert.ok(
    !("guidelinesFile" in registry.components["button"]),
    "guidelinesFile must not be present on the entry",
  );
});

// ---- ζ.2 (2026-05-13): three-axis grouping (section + group) ----

test("transform-registry — components get section + group from page", function () {
  // Tag-pattern: multiple component sets on one page should share a `group`
  // = page clean-name. This is the field docs sidebar uses to collapse 9
  // Tag variants into one navigation node.
  var componentSets = [
    {
      name: "Tag, read only",
      key: "k-tag-read-only",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✍️ Tag (Identification key)" },
    },
    {
      name: "Tag, Catalog",
      key: "k-tag-catalog",
      node_id: "1:2",
      description: "",
      containing_frame: { pageName: "✍️ Tag (Identification key)" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
    "1:2": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "     ✍️ Tag (Identification key)" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
  });

  // Both Tag variants share the same section, category, AND group.
  assert.equal(registry.components["tag-read-only"].section, "Components");
  assert.equal(registry.components["tag-read-only"].category, "Data Display");
  assert.equal(
    registry.components["tag-read-only"].group,
    "Tag (Identification key)",
  );

  assert.equal(registry.components["tag-catalog"].section, "Components");
  assert.equal(registry.components["tag-catalog"].category, "Data Display");
  assert.equal(
    registry.components["tag-catalog"].group,
    "Tag (Identification key)",
  );
});

test("transform-registry — icons get section + group from containing_frame.name", function () {
  // Foundations icons live in one big "Icons" page with multiple frame
  // containers (Navigation icons / Status icons / etc.). containing_frame.name
  // identifies the frame, providing finer sidebar bucketing than page-name
  // alone.
  var componentSets = [
    {
      name: "icon-arrow-right",
      key: "k-arrow",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "Icons", name: "Navigation icons" },
    },
    {
      name: "icon-warning",
      key: "k-warn",
      node_id: "1:2",
      description: "",
      containing_frame: { pageName: "Icons", name: "Status icons" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
    "1:2": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "💎 FOUNDATIONS" },
    { type: "CANVAS", name: "Icons" },
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
  });

  // section = "Foundations" (top-level marker), category = "Icons" (page),
  // group = containing_frame.name (frame within page).
  assert.equal(registry.components["icon-arrow-right"].section, "Foundations");
  assert.equal(registry.components["icon-arrow-right"].category, "Icons");
  assert.equal(
    registry.components["icon-arrow-right"].group,
    "Navigation icons",
  );

  assert.equal(registry.components["icon-warning"].section, "Foundations");
  assert.equal(registry.components["icon-warning"].category, "Icons");
  assert.equal(registry.components["icon-warning"].group, "Status icons");
});

test("transform-registry — icons fall back to page-name when frame missing/redundant", function () {
  // If containing_frame.name is absent OR equals the page clean-name,
  // group falls back to page clean-name. Defensive — avoids `group: null`
  // and avoids redundant "Icons" group inside the "Icons" category.
  var componentSets = [
    {
      name: "icon-loose",
      key: "k-loose",
      node_id: "1:1",
      description: "",
      // No containing_frame.name
      containing_frame: { pageName: "Icons" },
    },
    {
      name: "icon-redundant",
      key: "k-red",
      node_id: "1:2",
      description: "",
      // containing_frame.name same as page name → fall back to page
      containing_frame: { pageName: "Icons", name: "Icons" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
    "1:2": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "💎 FOUNDATIONS" },
    { type: "CANVAS", name: "Icons" },
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
  });

  assert.equal(registry.components["icon-loose"].group, "Icons");
  assert.equal(registry.components["icon-redundant"].group, "Icons");
});

test("transform-categories — extractSectionName strips emoji + title-cases", function () {
  var fn = require(
    require("path").join(
      __dirname,
      "..",
      "scripts",
      "transformers",
      "transform-categories.js",
    ),
  )._extractSectionName;
  assert.equal(fn("🧱 COMPONENTS"), "Components");
  assert.equal(fn("💎 FOUNDATIONS"), "Foundations");
  assert.equal(fn("🎨 BRAND ASSETS"), "Brand Assets");
  assert.equal(fn("🌐 WHITE-LABEL SERVICES"), "White-label Services");
  // Single-emoji-only (no words) — no section name
  assert.equal(fn("🧱"), null);
});

// ---- ζ.3 (2026-05-13): nestedComponents population ----

test("transform-registry — nestedComponents from INSTANCE_SWAP property defaults", function () {
  // Card has a "LeadingIcon" INSTANCE_SWAP property whose default points
  // to the "icon-info" component. After ζ.3, card's nestedComponents
  // should include { slug: "icon-info", role: "LeadingIcon", source: "instance-swap" }.
  var componentSets = [
    {
      name: "icon-info",
      key: "k-icon-info",
      node_id: "2:1",
      description: "",
      containing_frame: { pageName: "✅ Icons" },
    },
    {
      name: "Card",
      key: "k-card",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✅ Card" },
    },
  ];
  var componentSetNodes = {
    "2:1": { document: { componentPropertyDefinitions: {} } },
    "1:1": {
      document: {
        componentPropertyDefinitions: {
          "LeadingIcon#15:0": {
            type: "INSTANCE_SWAP",
            defaultValue: "k-icon-info",
          },
        },
      },
    },
  };

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
  });

  assert.deepEqual(registry.components["card"].nestedComponents, [
    { slug: "icon-info", role: "LeadingIcon", source: "instance-swap" },
  ]);
  // icon-info has no nested instances of its own.
  assert.deepEqual(registry.components["icon-info"].nestedComponents, []);
});

test("transform-registry — nestedComponents from hardcoded child INSTANCE nodes", function () {
  // Avatar contains a hardcoded "icon-user" INSTANCE child (not swappable).
  // Tree walk should find it and emit role:null + source:"child-instance".
  var componentSets = [
    {
      name: "icon-user",
      key: "k-icon-user",
      node_id: "2:1",
      description: "",
      containing_frame: { pageName: "✅ Icons" },
    },
    {
      name: "Avatar",
      key: "k-avatar",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✅ Avatar" },
    },
  ];
  var componentSetNodes = {
    "2:1": { document: { componentPropertyDefinitions: {} } },
    "1:1": {
      document: {
        componentPropertyDefinitions: {},
        // Recursive structure — wrapped in a frame for realism
        children: [
          {
            type: "FRAME",
            children: [{ type: "INSTANCE", componentId: "2:1" }],
          },
        ],
      },
    },
  };

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
  });

  assert.deepEqual(registry.components["avatar"].nestedComponents, [
    { slug: "icon-user", role: null, source: "child-instance" },
  ]);
});

test("transform-registry — nestedComponents dedupes same target across sources", function () {
  // If a component appears as BOTH an INSTANCE_SWAP default AND a hardcoded
  // child INSTANCE, we keep the instance-swap entry (curated, has role).
  var componentSets = [
    {
      name: "icon-warning",
      key: "k-warn",
      node_id: "2:1",
      description: "",
      containing_frame: { pageName: "✅ Icons" },
    },
    {
      name: "Alert",
      key: "k-alert",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✅ Alert" },
    },
  ];
  var componentSetNodes = {
    "2:1": { document: { componentPropertyDefinitions: {} } },
    "1:1": {
      document: {
        componentPropertyDefinitions: {
          "Icon#1:0": { type: "INSTANCE_SWAP", defaultValue: "k-warn" },
        },
        children: [{ type: "INSTANCE", componentId: "2:1" }],
      },
    },
  };

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
  });

  assert.equal(registry.components["alert"].nestedComponents.length, 1);
  assert.equal(
    registry.components["alert"].nestedComponents[0].source,
    "instance-swap",
  );
  assert.equal(registry.components["alert"].nestedComponents[0].role, "Icon");
});

test("transform-registry — nestedComponents skips self-references", function () {
  // A component shouldn't list itself as a nested component, even if
  // Figma data accidentally points back to itself.
  var componentSets = [
    {
      name: "Recursive",
      key: "k-rec",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✅ Recursive" },
    },
  ];
  var componentSetNodes = {
    "1:1": {
      document: {
        componentPropertyDefinitions: {
          "Self#1:0": { type: "INSTANCE_SWAP", defaultValue: "k-rec" },
        },
        children: [{ type: "INSTANCE", componentId: "1:1" }],
      },
    },
  };

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
  });

  assert.deepEqual(registry.components["recursive"].nestedComponents, []);
});

test("transform-registry — nestedComponents skips unresolvable refs", function () {
  // INSTANCE_SWAP defaults / INSTANCE children pointing to keys/nodeIds
  // outside the current registry (e.g., a library import from a different
  // kit) get silently dropped — no false-positive entries.
  var componentSets = [
    {
      name: "Card",
      key: "k-card",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✅ Card" },
    },
  ];
  var componentSetNodes = {
    "1:1": {
      document: {
        componentPropertyDefinitions: {
          "Icon#1:0": {
            type: "INSTANCE_SWAP",
            defaultValue: "k-from-different-kit",
          },
        },
        children: [{ type: "INSTANCE", componentId: "9:9" }],
      },
    },
  };

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
  });

  assert.deepEqual(registry.components["card"].nestedComponents, []);
});

// ---- ζ.5 (2026-05-13): icon-groups semantic mapping ----

test("transform-registry — applies icon-groups for category=Icons (single group)", function () {
  // Single-group icon: `group` set to the matched label; no
  // `secondaryGroups` emitted.
  var componentSets = [
    {
      name: "alert-circle",
      key: "k-ac",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "Icons", name: "Actual icons" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "💎 FOUNDATIONS" },
    { type: "CANVAS", name: "Icons" },
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    iconGroups: { Status: ["alert-circle"], Common: ["other"] },
  });

  assert.equal(registry.components["alert-circle"].category, "Icons");
  assert.equal(registry.components["alert-circle"].group, "Status");
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      registry.components["alert-circle"],
      "secondaryGroups",
    ),
    false,
    "single-group icons have no secondaryGroups field",
  );
});

test("transform-registry — multi-group icon gets primary group + secondaryGroups (ζ.5)", function () {
  // Iteration order in icon-groups determines primary: Navigation first
  // → primary; Common appears second → secondaryGroups.
  var componentSets = [
    {
      name: "download",
      key: "k-dl",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "Icons", name: "Actual icons" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "💎 FOUNDATIONS" },
    { type: "CANVAS", name: "Icons" },
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    iconGroups: {
      Navigation: ["download"],
      Common: ["download"],
    },
  });

  assert.equal(registry.components["download"].group, "Navigation");
  assert.deepEqual(registry.components["download"].secondaryGroups, ["Common"]);
});

test("transform-registry — unmapped icon falls back to group=Other", function () {
  // Icon not in the mapping (e.g., recently added by designer, not yet
  // classified) → group: "Other"; no secondaryGroups.
  var componentSets = [
    {
      name: "icon-brand-new",
      key: "k-new",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "Icons", name: "Actual icons" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "💎 FOUNDATIONS" },
    { type: "CANVAS", name: "Icons" },
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    iconGroups: { Status: ["other-thing"] },
  });

  assert.equal(registry.components["icon-brand-new"].group, "Other");
});

test("transform-registry — icon-groups ignores _-prefixed metadata keys", function () {
  // _naming_convention / _generated_from are documentation keys, not group
  // labels. Verify they don't pollute the lookup.
  var componentSets = [
    {
      name: "alert-circle",
      key: "k-ac",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "Icons", name: "Actual icons" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "💎 FOUNDATIONS" },
    { type: "CANVAS", name: "Icons" },
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    iconGroups: {
      _naming_convention: "ignored",
      _generated_from: "also ignored",
      Status: ["alert-circle"],
    },
  });

  assert.equal(registry.components["alert-circle"].group, "Status");
});

test("transform-registry — non-icon components unaffected by icon-groups (ζ.5)", function () {
  // Button is in Components/Action. Its `group` should stay as page-name
  // (Button) — icon-groups must NOT touch non-icons.
  var componentSets = [
    {
      name: "Button",
      key: "k-button",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✅ Button" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "     ✅ Button" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    iconGroups: { Status: ["button"] }, // even if mistakenly listed, ignored
  });

  assert.equal(registry.components["button"].group, "Button");
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      registry.components["button"],
      "secondaryGroups",
    ),
    false,
  );
});

// ---- COMPONENT_ON_CATEGORY_PAGE: component frames sitting directly on a
// category-header canvas (e.g. "Form") instead of their
// own member page. lookupCategoryEntry misses (header pages are never in
// categoryMap) and MEMBER_WITHOUT_CATEGORY never fires (header canvases are
// correctly classified as headers, not orphan members) — so without this
// detection the sync silently produces a category-less registry entry.
//
// Vincent's rule (2026-07-02): this is now a publish gate, not just a
// warning. A component whose frames sit directly on a category-header page
// is EXCLUDED from registry.components entirely — a component is published
// by giving it its own member page. The warning still fires. ----

function knownCategoryHeaders() {
  return [
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];
}

test("transform-registry — component frame directly on a category-header page: no category, warns", function () {
  var componentSets = [
    {
      name: "Rogue Field",
      key: "k-rogue",
      node_id: "1:1",
      description: "",
      // Sits directly on the "Form" category canvas —
      // no member page of its own, no status-emoji prefix.
      containing_frame: { pageName: "Form" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [{ type: "CANVAS", name: "🧱 COMPONENTS" }].concat(
    knownCategoryHeaders(),
  );

  var warningBatches = [];
  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    onWarnings: function (ws) {
      warningBatches.push(ws);
    },
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(registry.components, "rogue-field"),
    false,
    "component on a category-header page is excluded from the registry",
  );
  assert.equal(
    registry.componentCount,
    0,
    "componentCount reflects the exclusion",
  );

  var allWarnings = [].concat.apply([], warningBatches);
  var componentWarnings = allWarnings.filter(function (w) {
    return w.code === "COMPONENT_ON_CATEGORY_PAGE";
  });
  assert.equal(componentWarnings.length, 1);
  assert.equal(componentWarnings[0].page, "Form");
  assert.equal(componentWarnings[0].component, "rogue-field");
});

test("transform-registry — component frame on a category-header page WITH a status-emoji prefix: no category, warns", function () {
  var componentSets = [
    {
      name: "Rogue Field",
      key: "k-rogue",
      node_id: "1:1",
      description: "",
      // Status emoji prefixed directly on the category canvas name itself
      // (as opposed to a member page under it) — still a header miss.
      containing_frame: { pageName: "✍️ Form" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [{ type: "CANVAS", name: "🧱 COMPONENTS" }].concat(
    knownCategoryHeaders(),
  );

  var warningBatches = [];
  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    onWarnings: function (ws) {
      warningBatches.push(ws);
    },
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(registry.components, "rogue-field"),
    false,
    "component on a category-header page (emoji-prefixed) is excluded from the registry",
  );

  var allWarnings = [].concat.apply([], warningBatches);
  var componentWarnings = allWarnings.filter(function (w) {
    return w.code === "COMPONENT_ON_CATEGORY_PAGE";
  });
  assert.equal(componentWarnings.length, 1);
  assert.equal(componentWarnings[0].page, "Form");
  assert.equal(componentWarnings[0].component, "rogue-field");
});

test("transform-registry — component SET on a category-header page is excluded from the registry (set-loop exclusion)", function () {
  var componentSets = [
    {
      name: "Rogue Set",
      key: "k-rogue-set",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "Navigation" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [{ type: "CANVAS", name: "🧱 COMPONENTS" }].concat(
    knownCategoryHeaders(),
  );

  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    onWarnings: function () {},
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(registry.components, "rogue-set"),
    false,
    "component set on a category-header page is excluded from the registry",
  );
  assert.equal(registry.componentCount, 0);
});

test("transform-registry — normally-categorized component emits no COMPONENT_ON_CATEGORY_PAGE warning", function () {
  var componentSets = [
    {
      name: "Button",
      key: "k-button",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "✅ Button" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "     ✅ Button" },
  ].concat(knownCategoryHeaders().slice(1));

  var warningBatches = [];
  transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    onWarnings: function (ws) {
      warningBatches.push(ws);
    },
  });

  var allWarnings = [].concat.apply([], warningBatches);
  var componentWarnings = allWarnings.filter(function (w) {
    return w.code === "COMPONENT_ON_CATEGORY_PAGE";
  });
  assert.equal(componentWarnings.length, 0);
});

test("transform-registry — onWarnings concat semantics: category-inference warnings AND component warnings both arrive", function () {
  // Mirrors how sync-from-figma.js accumulates: categoryWarnings =
  // categoryWarnings.concat(ws || []) across multiple onWarnings calls,
  // rather than a plain assignment that would clobber the first batch.
  var componentSets = [
    {
      name: "Rogue Field",
      key: "k-rogue",
      node_id: "1:1",
      description: "",
      containing_frame: { pageName: "Form" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  // "Custom Family" is a category header not in KNOWN_CATEGORIES — triggers
  // an UNKNOWN_CATEGORY warning from inferCategoryMap (the first batch).
  var documentChildren = [
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Custom Family" },
  ].concat(knownCategoryHeaders());

  var categoryWarnings = [];
  transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    onWarnings: function (ws) {
      categoryWarnings = categoryWarnings.concat(ws || []);
    },
  });

  var codes = categoryWarnings.map(function (w) {
    return w.code;
  });
  assert.ok(
    codes.indexOf("UNKNOWN_CATEGORY") >= 0,
    "first batch (category inference) still received: " + JSON.stringify(codes),
  );
  assert.ok(
    codes.indexOf("COMPONENT_ON_CATEGORY_PAGE") >= 0,
    "second batch (component-on-category-page) also received: " +
      JSON.stringify(codes),
  );
});

test("transform-registry — same-slug collision: header-page duplicate never clobbers member-page original (member-first order)", function () {
  // Two component sets with the same name (→ same slug "rogue-field"):
  // - one on a member page: "✅ Rogue Field" under "Form"
  // - one on the category header itself: "Form"
  //
  // The member-page original should win; the header-page duplicate should be
  // excluded. The duplicate must NOT overwrite the member entry in the registry.
  var componentSets = [
    {
      name: "Rogue Field",
      key: "k-rogue-member",
      node_id: "1:1",
      description: "",
      // Member page under Form
      containing_frame: { pageName: "✅ Rogue Field" },
    },
    {
      name: "Rogue Field",
      key: "k-rogue-header",
      node_id: "1:2",
      description: "",
      // Same-slug duplicate on the category header itself
      containing_frame: { pageName: "Form" },
    },
  ];
  var componentSetNodes = {
    "1:1": { document: { componentPropertyDefinitions: {} } },
    "1:2": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "     ✅ Rogue Field" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var warningBatches = [];
  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    onWarnings: function (ws) {
      warningBatches.push(ws);
    },
  });

  // Slug present exactly once
  assert.equal(
    Object.prototype.hasOwnProperty.call(registry.components, "rogue-field"),
    true,
    "rogue-field slug is present in registry",
  );
  var allKeys = Object.keys(registry.components);
  var rogueFieldCount = allKeys.filter(function (k) {
    return k === "rogue-field";
  }).length;
  assert.equal(rogueFieldCount, 1, "rogue-field slug appears exactly once");

  // Key and nodeId are the MEMBER-page ones
  assert.equal(
    registry.components["rogue-field"].key,
    "k-rogue-member",
    "member-page key is retained (not overwritten by header-page duplicate)",
  );
  assert.equal(
    registry.components["rogue-field"].nodeId,
    "1:1",
    "member-page nodeId is retained (not overwritten by header-page duplicate)",
  );

  // componentCount counts it once
  assert.equal(registry.componentCount, 1, "componentCount is 1");

  // COMPONENT_ON_CATEGORY_PAGE warning fired once for that slug
  var allWarnings = [].concat.apply([], warningBatches);
  var componentWarnings = allWarnings.filter(function (w) {
    return w.code === "COMPONENT_ON_CATEGORY_PAGE";
  });
  assert.equal(
    componentWarnings.length,
    1,
    "COMPONENT_ON_CATEGORY_PAGE warning fired exactly once",
  );
  assert.equal(
    componentWarnings[0].component,
    "rogue-field",
    "warning is for rogue-field slug",
  );
  assert.equal(
    componentWarnings[0].page,
    "Form",
    "warning cites the category header page",
  );
});

test("transform-registry — same-slug collision: header-page duplicate never clobbers member-page original (header-first order)", function () {
  // Same scenario as above, but componentSets array order reversed: header
  // duplicate comes first in the array. The transformation must still retain
  // the member-page original; the order of discovery must not affect the outcome.
  var componentSets = [
    {
      name: "Rogue Field",
      key: "k-rogue-header",
      node_id: "1:2",
      description: "",
      // Same-slug duplicate on the category header itself (FIRST in array)
      containing_frame: { pageName: "Form" },
    },
    {
      name: "Rogue Field",
      key: "k-rogue-member",
      node_id: "1:1",
      description: "",
      // Member page under Form (SECOND in array)
      containing_frame: { pageName: "✅ Rogue Field" },
    },
  ];
  var componentSetNodes = {
    "1:2": { document: { componentPropertyDefinitions: {} } },
    "1:1": { document: { componentPropertyDefinitions: {} } },
  };
  var documentChildren = [
    { type: "CANVAS", name: "🧱 COMPONENTS" },
    { type: "CANVAS", name: "Form" },
    { type: "CANVAS", name: "     ✅ Rogue Field" },
    { type: "CANVAS", name: "Action" },
    { type: "CANVAS", name: "Navigation" },
    { type: "CANVAS", name: "Data Display" },
    { type: "CANVAS", name: "Feedback" },
    { type: "CANVAS", name: "Overlays" },
  ];

  var warningBatches = [];
  var registry = transformRegistry({
    library: "ds",
    fileKey: "test",
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: [],
    standaloneNodes: {},
    documentChildren: documentChildren,
    onWarnings: function (ws) {
      warningBatches.push(ws);
    },
  });

  // Slug present exactly once
  assert.equal(
    Object.prototype.hasOwnProperty.call(registry.components, "rogue-field"),
    true,
    "rogue-field slug is present in registry",
  );
  var allKeys = Object.keys(registry.components);
  var rogueFieldCount = allKeys.filter(function (k) {
    return k === "rogue-field";
  }).length;
  assert.equal(rogueFieldCount, 1, "rogue-field slug appears exactly once");

  // Key and nodeId are STILL the MEMBER-page ones (despite header-first order)
  assert.equal(
    registry.components["rogue-field"].key,
    "k-rogue-member",
    "member-page key is retained even when header-page duplicate comes first",
  );
  assert.equal(
    registry.components["rogue-field"].nodeId,
    "1:1",
    "member-page nodeId is retained even when header-page duplicate comes first",
  );

  // componentCount counts it once
  assert.equal(registry.componentCount, 1, "componentCount is 1");

  // COMPONENT_ON_CATEGORY_PAGE warning fired once for that slug
  var allWarnings = [].concat.apply([], warningBatches);
  var componentWarnings = allWarnings.filter(function (w) {
    return w.code === "COMPONENT_ON_CATEGORY_PAGE";
  });
  assert.equal(
    componentWarnings.length,
    1,
    "COMPONENT_ON_CATEGORY_PAGE warning fired exactly once",
  );
  assert.equal(
    componentWarnings[0].component,
    "rogue-field",
    "warning is for rogue-field slug",
  );
  assert.equal(
    componentWarnings[0].page,
    "Form",
    "warning cites the category header page",
  );
});

test("transform-categories — page override maps a churned icon page clean-name to canonical category", function () {
  var children = [
    canvas("✍️ DS Icons"),
    canvas("🧱 COMPONENTS"),
    canvas("Feedback"),
    canvas("     ✍️ Alert (banner)"),
  ];
  var overrides = { "DS Icons": "Icons", "Alert (banner)": "Feedback" };
  var result = inferCategoryMap(children, overrides);

  // Self-hosting icons page: override wins regardless of section/order.
  assert.equal(result.map["DS Icons"].category, "Icons");
  assert.equal(result.map["DS Icons"].status, "in-progress");

  // A member-style page also resolvable via override (Alert banner casualty).
  assert.equal(result.map["Alert (banner)"].category, "Feedback");

  // No override arg: the override does not fire, so the pre-existing ζ.2
  // path self-categorizes the non-COMPONENTS page to its own clean-name.
  // The override's job is to normalize that ("DS Icons") to "Icons".
  var plain = inferCategoryMap(children);
  assert.equal(plain.map["DS Icons"].category, "DS Icons");
});

test("transform-categories — an override key colliding with a category header does not hijack the header", function () {
  var children = [
    canvas("🧱 COMPONENTS"),
    canvas("Feedback"),
    canvas("     ✍️ Toast"),
  ];
  // A misconfigured override keyed on a real category-header name must NOT
  // intercept the header (which would leave currentCategory unset and orphan
  // the member pages below it).
  var overrides = { Feedback: "Feedback" };
  var result = inferCategoryMap(children, overrides);
  assert.equal(result.map["Toast"].category, "Feedback");
});

// The DS Kit's COMPONENTS section names its category header "Form". Ours said
// "Form", so the header went unrecognized: its nine member
// pages lost their attribution, and 21 components fell back to a last-known
// value that carried a PAGE NAME as the category and a stale
// section=Foundations. That is what put Field/Label/Message/Textfield buttons
// under FOUNDATIONS in the docs sidebar. Fixture mirrors the live page panel.
test("the real 'Form' header attributes its member pages", function () {
  var children = [
    canvas("💎 FOUNDATIONS"),
    canvas("✅ Breakpoint, grid & structure"),
    canvas("🧱 COMPONENTS"),
    canvas("Action"),
    canvas("     ✍️ Button"),
    canvas("Form"),
    canvas("     ✅ Base(label, field, message, textfield button)"),
    canvas("     ✍️ Checkbox, checkbox card, checkbox group"),
    canvas("     ✍️ Text area, text input"),
    canvas("Data Display"),
    canvas("     ✅ Avatar"),
  ];
  var result = inferCategoryMap(children, {});
  var base = result.map["Base(label, field, message, textfield button)"];
  assert.ok(base, "the Base page must be attributed");
  assert.equal(base.category, "Form");
  assert.equal(base.section, "Components", "a Form page is NOT a Foundation");
  assert.equal(
    result.map["Checkbox, checkbox card, checkbox group"].category,
    "Form",
  );
  assert.equal(result.map["Text area, text input"].category, "Form");
  // Neighbours must be unaffected.
  assert.equal(result.map["Button"].category, "Action");
  assert.equal(result.map["Avatar"].category, "Data Display");
});

test("no category is named for a Figma page rather than a taxonomy", function () {
  // A page name leaking into KNOWN_CATEGORIES is the shape that produced the
  // BASE-LABEL-MESSAGE-FIELD-TEXTFIELD-BUTTONS sidebar section.
  mod.KNOWN_CATEGORIES.forEach(function (c) {
    assert.doesNotMatch(
      c,
      /,|\(/,
      "category " + JSON.stringify(c) + " reads like a Figma page name",
    );
  });
});
