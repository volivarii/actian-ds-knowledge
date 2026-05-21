"use strict";

// Tests for scripts/content/fanout-patterns.js.
//
// Covers the four loosely-coupled units:
//   - parsePatternFrontmatter — strict subset YAML parser for our 2 fields
//   - resolveFanoutSet         — slug + category validation against registry / categories
//   - applyPatternFanout       — mutation of perComponent map
//   - runFanout                — top-level driver wiring all of the above
//
// Plus an idempotency end-to-end (run twice → byte-identical output) on a
// synthetic mini repo. The full-pipeline integration (running the real CLI
// against patterns + tests/guidelines-derive.test.js) is exercised separately.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var os = require("node:os");

var fanout = require("../scripts/content/fanout-patterns.js");

// ───────────────────────────────────────────────────────────────────────────
// parsePatternFrontmatter
// ───────────────────────────────────────────────────────────────────────────

test("parsePatternFrontmatter handles inline flow array", function () {
  var fm = fanout.parsePatternFrontmatter(
    "title: Forms\nrelatedComponents: [text-input, checkbox]\nnav_order: 14",
  );
  assert.deepEqual(fm.relatedComponents, ["text-input", "checkbox"]);
  assert.equal(fm.relatedCategories, undefined);
});

test("parsePatternFrontmatter handles block-style array", function () {
  var fm = fanout.parsePatternFrontmatter(
    [
      "title: Empty",
      "relatedComponents:",
      "  - empty-state",
      "  - error-state",
      "nav_order: 21",
    ].join("\n"),
  );
  assert.deepEqual(fm.relatedComponents, ["empty-state", "error-state"]);
});

test("parsePatternFrontmatter handles both fields together", function () {
  var fm = fanout.parsePatternFrontmatter(
    "relatedComponents: [text-input]\nrelatedCategories: [form-input-selection]",
  );
  assert.deepEqual(fm.relatedComponents, ["text-input"]);
  assert.deepEqual(fm.relatedCategories, ["form-input-selection"]);
});

test("parsePatternFrontmatter ignores unknown keys", function () {
  var fm = fanout.parsePatternFrontmatter(
    "title: X\nrelatedComponents: [a]\nfoo: bar\nrelatedSomething: [z]",
  );
  assert.deepEqual(Object.keys(fm).sort(), ["relatedComponents"]);
});

test("parsePatternFrontmatter returns empty object for null/empty input", function () {
  assert.deepEqual(fanout.parsePatternFrontmatter(null), {});
  assert.deepEqual(fanout.parsePatternFrontmatter(""), {});
});

test("parsePatternFrontmatter strips quotes from inline array items", function () {
  var fm = fanout.parsePatternFrontmatter(
    "relatedComponents: [\"text-input\", 'checkbox']",
  );
  assert.deepEqual(fm.relatedComponents, ["text-input", "checkbox"]);
});

// ───────────────────────────────────────────────────────────────────────────
// resolveFanoutSet (CI-gate behavior)
// ───────────────────────────────────────────────────────────────────────────

function makeRegistry(slugs) {
  return new Set(slugs);
}

function makeCategoriesData(mapping) {
  // mapping: { "Form (input & selection)": [<member slugs>], ... }
  var categories = {};
  Object.keys(mapping).forEach(function (label) {
    categories[label] = {
      components: mapping[label],
      count: mapping[label].length,
    };
  });
  return { categories: categories };
}

function makeCategorySlugFor(labelToSlug) {
  return function (label) {
    return labelToSlug[label] || "";
  };
}

test("resolveFanoutSet unions explicit components + category-expanded set", function () {
  var pattern = {
    slug: "forms",
    bucket: "patterns",
    frontmatter: {
      relatedComponents: ["text-input"],
      relatedCategories: ["form-input-selection"],
    },
  };
  var registry = makeRegistry(["text-input", "checkbox", "search"]);
  var cats = makeCategoriesData({
    "Form (input & selection)": ["checkbox", "search"],
  });
  var slugFor = makeCategorySlugFor({
    "Form (input & selection)": "form-input-selection",
  });

  var res = fanout.resolveFanoutSet(pattern, registry, cats, slugFor);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(Array.from(res.slugs).sort(), [
    "checkbox",
    "search",
    "text-input",
  ]);
});

test("resolveFanoutSet flags unknown component slug", function () {
  var pattern = {
    slug: "forms",
    bucket: "patterns",
    frontmatter: { relatedComponents: ["text-input", "nonexistent"] },
  };
  var registry = makeRegistry(["text-input"]);
  var cats = makeCategoriesData({});
  var slugFor = makeCategorySlugFor({});

  var res = fanout.resolveFanoutSet(pattern, registry, cats, slugFor);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /unknown component slug 'nonexistent'/);
  assert.deepEqual(Array.from(res.slugs), ["text-input"]); // valid slug still resolved
});

test("resolveFanoutSet flags unknown category slug", function () {
  var pattern = {
    slug: "x",
    bucket: "patterns",
    frontmatter: { relatedCategories: ["fake-category"] },
  };
  var registry = makeRegistry([]);
  var cats = makeCategoriesData({ Feedback: ["alert-banner"] });
  var slugFor = makeCategorySlugFor({ Feedback: "feedback" });

  var res = fanout.resolveFanoutSet(pattern, registry, cats, slugFor);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /unknown category 'fake-category'/);
});

test("resolveFanoutSet resolves registry-alias keys to canonical guideline slugs", function () {
  // Author wrote `relatedComponents: [input, checkbox-with-label]` — both are
  // registry keys with aliases (input → text-input; checkbox-with-label →
  // checkbox). The fan-out set must contain the CANONICALS, so synthesis
  // doesn't collide with the alias-copy step in derivePipeline.
  var pattern = {
    slug: "forms",
    bucket: "patterns",
    frontmatter: {
      relatedComponents: ["input", "checkbox-with-label", "radio-button"],
    },
  };
  var registry = makeRegistry(["input", "checkbox-with-label", "radio-button"]);
  var aliases = {
    input: "text-input",
    "checkbox-with-label": "checkbox",
    // radio-button has no alias — passes through unchanged
  };
  var res = fanout.resolveFanoutSet(
    pattern,
    registry,
    makeCategoriesData({}),
    makeCategorySlugFor({}),
    aliases,
  );
  assert.deepEqual(res.errors, []);
  assert.deepEqual(
    Array.from(res.slugs).sort(),
    ["checkbox", "radio-button", "text-input"],
    "registry-alias keys resolved to canonical slugs; non-aliased pass through",
  );
});

test("resolveFanoutSet accepts canonical slugs that are alias targets (not registry keys)", function () {
  // Author wrote `relatedComponents: [text-input]` — text-input is NOT a
  // registry key but IS the canonical target of an alias. Should be accepted.
  var pattern = {
    slug: "x",
    bucket: "patterns",
    frontmatter: { relatedComponents: ["text-input"] },
  };
  var res = fanout.resolveFanoutSet(
    pattern,
    makeRegistry(["input"]),
    makeCategoriesData({}),
    makeCategorySlugFor({}),
    { input: "text-input" },
  );
  assert.deepEqual(res.errors, []);
  assert.deepEqual(Array.from(res.slugs), ["text-input"]);
});

test("resolveFanoutSet rejects non-slug input shapes", function () {
  var pattern = {
    slug: "x",
    bucket: "patterns",
    frontmatter: { relatedComponents: ["Not Kebab", "Has Spaces"] },
  };
  var res = fanout.resolveFanoutSet(
    pattern,
    makeRegistry(["foo"]),
    makeCategoriesData({}),
    makeCategorySlugFor({}),
  );
  assert.equal(res.errors.length, 2);
  res.errors.forEach(function (e) {
    assert.match(e, /is not a valid slug/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// applyPatternFanout
// ───────────────────────────────────────────────────────────────────────────

function makeAuthoredDoc(slug, contentStatus) {
  return {
    _schema_version: 1,
    _meta: {
      auto_generated: true,
      source: "components/src/" + slug + "/",
      do_not_edit: "...",
    },
    slug: slug,
    component: slug,
    meta: { category: "feedback" },
    domains: {
      content: {
        status: contentStatus || "approved",
        markdown: "## Authored\n\nOriginal copy.",
        sections: [
          { heading: "Authored", content: [{ prose: "Original copy." }] },
        ],
      },
    },
  };
}

function makePattern(slug, fanoutSlugs, sections) {
  return {
    slug: slug,
    bucket: "patterns",
    sections: sections || [
      { heading: "Pattern heading", content: [{ prose: "Pattern body." }] },
    ],
    fanoutSlugs: new Set(fanoutSlugs),
  };
}

test("applyPatternFanout appends pattern sections to authored components, preserves status", function () {
  var perComponent = {
    "text-input": makeAuthoredDoc("text-input", "approved"),
  };
  var patterns = [makePattern("forms", ["text-input"])];

  fanout.applyPatternFanout(
    perComponent,
    patterns,
    { components: {} },
    function () {
      return "feedback";
    },
  );

  var d = perComponent["text-input"].domains.content;
  assert.equal(d.status, "approved", "authored status preserved");
  assert.equal(d.sections.length, 2, "authored + pattern section");
  assert.equal(d.sections[0].heading, "Authored");
  assert.equal(d.sections[0].source, undefined, "authored section unmarked");
  assert.equal(d.sections[1].heading, "Pattern heading");
  assert.equal(d.sections[1].source, "pattern:forms", "pattern section marked");
});

test("applyPatternFanout synthesizes guideline doc for pattern-only components", function () {
  var perComponent = {};
  var patterns = [makePattern("empty-and-system-states", ["empty-state"])];
  var registry = {
    components: {
      "empty-state": { name: "Empty state", category: "Feedback" },
    },
  };
  var slugFor = function (label) {
    return label === "Feedback" ? "feedback" : "";
  };

  var summary = fanout.applyPatternFanout(
    perComponent,
    patterns,
    registry,
    slugFor,
  );

  assert.ok(perComponent["empty-state"], "doc synthesized");
  var doc = perComponent["empty-state"];
  assert.equal(doc._schema_version, 1);
  assert.equal(doc.slug, "empty-state");
  assert.equal(doc.component, "Empty state");
  assert.equal(doc.meta.category, "feedback");
  assert.equal(doc.domains.content.status, "synthesized");
  assert.equal(doc.domains.content.sections.length, 1);
  assert.equal(
    doc.domains.content.sections[0].source,
    "pattern:empty-and-system-states",
  );
  assert.equal(
    doc.domains.content.markdown,
    undefined,
    "synthesized must NOT carry markdown",
  );
  assert.deepEqual(summary.synthesized, ["empty-state"]);
  assert.deepEqual(
    summary.skippedUncategorized,
    [],
    "categorized → not skipped",
  );
});

test("applyPatternFanout skips synthesis when registry entry has no category", function () {
  // Real-world case (2026-05-19): the Figma sync intentionally removes a
  // component's page tag (e.g. maintenance-banner moved to uncategorized).
  // The docs generator already skips uncategorized components, so a
  // synthesized guideline doc would be an unreachable artifact AND a
  // non-kebab category would fail schema validation (the pattern
  // ^[a-z][a-z0-9-]*$ rejects empty strings). Fan-out must defensively
  // skip such components and surface them in summary.skippedUncategorized.
  var perComponent = {};
  var patterns = [
    makePattern("empty-and-system-states", ["maintenance-banner"]),
  ];
  var registry = {
    components: {
      // No category field — component is intentionally uncategorized.
      "maintenance-banner": { name: "Maintenance banner" },
    },
  };
  var slugFor = function (label) {
    return label ? label.toLowerCase().replace(/\s+/g, "-") : "";
  };

  var summary = fanout.applyPatternFanout(
    perComponent,
    patterns,
    registry,
    slugFor,
  );

  assert.equal(
    perComponent["maintenance-banner"],
    undefined,
    "uncategorized component must NOT have a synthesized doc",
  );
  assert.deepEqual(summary.synthesized, [], "no synthesis");
  assert.deepEqual(summary.skippedUncategorized, [
    { slug: "maintenance-banner", patternSlug: "empty-and-system-states" },
  ]);
  // Pattern still counts as resolved for ordering purposes — stamped is empty
  // because nothing was stamped on this slug.
  assert.deepEqual(summary.stamped, []);
});

test("applyPatternFanout promotes not-started → synthesized when only pattern content", function () {
  var perComponent = {
    "empty-state": {
      _schema_version: 1,
      _meta: {
        auto_generated: true,
        source: "components/src/empty-state/",
        do_not_edit: "...",
      },
      slug: "empty-state",
      component: "Empty state",
      meta: { category: "feedback" },
      domains: { content: { status: "not-started" } },
    },
  };
  fanout.applyPatternFanout(
    perComponent,
    [makePattern("empty-and-system-states", ["empty-state"])],
    { components: {} },
    function () {
      return "feedback";
    },
  );
  var d = perComponent["empty-state"].domains.content;
  assert.equal(d.status, "synthesized");
  assert.equal(d.sections.length, 1);
});

test("applyPatternFanout drops prior pattern sections (idempotency primitive)", function () {
  // Simulate a doc that already carries pattern-stamped sections from a
  // previous run — the deriver normally rebuilds perComponent from scratch
  // so this shape doesn't actually appear in practice, but the dropPatternSections
  // pre-pass is defensive against partial state.
  var perComponent = {
    "text-input": {
      _schema_version: 1,
      _meta: {
        auto_generated: true,
        source: "components/src/text-input/",
        do_not_edit: "...",
      },
      slug: "text-input",
      component: "Text input",
      meta: { category: "form-input-selection" },
      domains: {
        content: {
          status: "approved",
          markdown: "## Authored\n\nReal copy.",
          sections: [
            { heading: "Authored", content: [{ prose: "Real copy." }] },
            { heading: "Stale pattern", source: "pattern:old", content: [] },
          ],
        },
      },
    },
  };
  fanout.applyPatternFanout(perComponent, [], { components: {} }, function () {
    return "";
  });
  // Stale pattern section gone; authored survives.
  var sections = perComponent["text-input"].domains.content.sections;
  assert.equal(sections.length, 1);
  assert.equal(sections[0].heading, "Authored");
});

// ───────────────────────────────────────────────────────────────────────────
// Idempotency end-to-end (synthetic mini repo)
// ───────────────────────────────────────────────────────────────────────────

test("runFanout produces byte-identical perComponent on repeated runs", function () {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fanout-test-"));
  try {
    var contentSrc = path.join(tmpDir, "content", "src");
    fs.mkdirSync(path.join(contentSrc, "patterns"), { recursive: true });

    fs.writeFileSync(
      path.join(contentSrc, "patterns", "empty-and-system-states.md"),
      [
        "---",
        'title: "Empty and system states"',
        "relatedComponents: [empty-state]",
        "---",
        "# Empty and system states",
        "",
        "Empty states explain what to do next.",
        "",
        "## When to use",
        "",
        "- When users have not yet created items.",
        "",
      ].join("\n"),
      "utf8",
    );

    // content-index.md needs to exist for readContentIndexOrder, but order
    // doesn't matter for a single pattern.
    fs.writeFileSync(
      path.join(contentSrc, "content-index.md"),
      '## All sections\n\n<a href="empty-and-system-states">Empty and system states</a>\n',
      "utf8",
    );

    var registry = {
      components: {
        "empty-state": { name: "Empty state", category: "Feedback" },
      },
    };
    var categoriesData = {
      categories: { Feedback: { components: ["empty-state"] } },
    };
    var slugFor = function (label) {
      return label === "Feedback" ? "feedback" : "";
    };

    var perComponentA = {};
    fanout.runFanout(tmpDir, perComponentA, registry, categoriesData, slugFor);

    var perComponentB = {};
    fanout.runFanout(tmpDir, perComponentB, registry, categoriesData, slugFor);

    assert.deepEqual(
      perComponentA,
      perComponentB,
      "two runs produce identical perComponent state",
    );
    assert.ok(perComponentA["empty-state"], "synthesized doc present");
    assert.equal(
      perComponentA["empty-state"].domains.content.status,
      "synthesized",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runFanout returns errors WITHOUT mutating perComponent when any pattern is invalid", function () {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fanout-test-"));
  try {
    var contentSrc = path.join(tmpDir, "content", "src");
    fs.mkdirSync(path.join(contentSrc, "patterns"), { recursive: true });

    // One valid pattern + one referencing an unknown slug
    fs.writeFileSync(
      path.join(contentSrc, "patterns", "good.md"),
      "---\nrelatedComponents: [foo]\n---\n# G\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(contentSrc, "patterns", "bad.md"),
      "---\nrelatedComponents: [does-not-exist]\n---\n# B\n",
      "utf8",
    );

    var registry = {
      components: { foo: { name: "Foo", category: "Feedback" } },
    };
    var categoriesData = { categories: {} };
    var slugFor = function () {
      return "";
    };

    var perComponent = {};
    var res = fanout.runFanout(
      tmpDir,
      perComponent,
      registry,
      categoriesData,
      slugFor,
    );

    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0], /unknown component slug 'does-not-exist'/);
    // Validation gate ran BEFORE any mutation — perComponent untouched
    assert.deepEqual(perComponent, {});
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
