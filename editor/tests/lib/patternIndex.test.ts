import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPatternIndex,
  type AppContextDoc,
  type RecipeDoc,
} from "../../src/lib/patternIndex";

// A miniature app-context in the shape app-context/dist/app-context.json ships:
// two apps, one of which reaches only some of the patterns it claims, and a
// pattern claimed by both.
const ctx: AppContextDoc = {
  apps: {
    studio: {
      label: "Studio",
      sidebar: [
        { label: "Catalog", id: "catalog" },
        { label: "Topics", id: "topics" },
      ],
      useCases: [
        {
          audience: ["Data steward"],
          jobs: ["Govern the catalog"],
          patterns: ["asset-detail-360", "ghost-pattern"],
        },
      ],
    },
    explorer: {
      label: "Explorer",
      sidebar: [],
      useCases: [],
    },
  },
  patterns: {
    "asset-detail-360": {
      label: "Asset detail 360",
      apps: ["studio"],
      tags: ["detail"],
      when: "Use for a single asset.",
      components: ["tabs", "button"],
      description: "A detail page for one asset.",
    },
    "right-sliding-drawer": {
      label: "Right sliding drawer",
      apps: ["studio", "explorer"],
      tags: ["overlay"],
      when: "Use for a peek that leaves the page live.",
      components: ["drawer"],
      description: "A 550px drawer docked right.",
    },
    "faceted-browse": {
      label: "Faceted browse",
      apps: ["studio"],
      tags: ["browse"],
      when: "Use for several independent facets.",
      components: ["checkbox"],
      description: "Three pane browse.",
    },
  },
};

const recipes: RecipeDoc[] = [
  {
    slug: "right-sliding-drawer",
    apps: ["explorer"],
    patterns: ["right-sliding-drawer"],
    derivedFrom: {
      surface: "Explorer > Marketplace",
      capturedOn: "2026-08-19",
    },
  },
  {
    slug: "studio-quick-edit-drawer",
    apps: ["studio"],
    patterns: ["right-sliding-drawer"],
    derivedFrom: { surface: "Studio > Catalog", capturedOn: "2026-08-20" },
  },
  {
    slug: "orphan-capture",
    apps: ["studio"],
    patterns: ["a-pattern-that-was-retired"],
    derivedFrom: { surface: "Studio > Nowhere", capturedOn: "2026-08-21" },
  },
];

test("a pattern claimed by two apps appears under both", () => {
  const index = buildPatternIndex(ctx, recipes);
  const studio = index.apps.find((a) => a.slug === "studio");
  const explorer = index.apps.find((a) => a.slug === "explorer");
  assert.ok(studio && explorer);
  const inStudio = studio.unreachedPatterns.map((p) => p.slug);
  const inExplorer = explorer.unreachedPatterns.map((p) => p.slug);
  assert.ok(inStudio.includes("right-sliding-drawer"));
  assert.ok(inExplorer.includes("right-sliding-drawer"));
});

test("a pattern carries every capture that names it, each with its surface", () => {
  const index = buildPatternIndex(ctx, recipes);
  const drawer = index.patterns.find((p) => p.slug === "right-sliding-drawer");
  assert.ok(drawer);
  assert.equal(drawer.recipes.length, 2);
  assert.deepEqual(drawer.recipes.map((r) => r.slug).sort(), [
    "right-sliding-drawer",
    "studio-quick-edit-drawer",
  ]);
  const studioCapture = drawer.recipes.find(
    (r) => r.slug === "studio-quick-edit-drawer",
  );
  assert.equal(studioCapture?.surface, "Studio > Catalog");
  assert.equal(studioCapture?.capturedOn, "2026-08-20");
  assert.deepEqual(studioCapture?.apps, ["studio"]);
});

test("a pattern no use case names is listed as unreached under the app that claims it", () => {
  const index = buildPatternIndex(ctx, recipes);
  const studio = index.apps.find((a) => a.slug === "studio");
  assert.ok(studio);
  const reached = studio.useCases.flatMap((u) => u.patterns.map((p) => p.slug));
  assert.deepEqual(reached, ["asset-detail-360"]);
  assert.deepEqual(studio.unreachedPatterns.map((p) => p.slug).sort(), [
    "faceted-browse",
    "right-sliding-drawer",
  ]);
});

test("a use case naming a pattern that does not exist says so rather than dropping it", () => {
  const index = buildPatternIndex(ctx, recipes);
  const studio = index.apps.find((a) => a.slug === "studio");
  const useCase = studio?.useCases[0];
  assert.ok(useCase);
  assert.deepEqual(useCase.missingPatterns, ["ghost-pattern"]);
});

test("a capture naming a pattern that does not exist is reported, not silently ignored", () => {
  const index = buildPatternIndex(ctx, recipes);
  assert.deepEqual(
    index.recipesNamingMissingPatterns.map((e) => [
      e.recipe.slug,
      e.missing.join(","),
    ]),
    [["orphan-capture", "a-pattern-that-was-retired"]],
  );
});

test("a capture that resolves one pattern still reports the name that resolves none", () => {
  // The join must be per name. Reporting only fully-unresolved captures lets a
  // typo ride along beside a real slug and vanish, which is the drop this
  // module's own contract forbids.
  const partial: RecipeDoc = {
    slug: "partly-wrong",
    apps: ["studio"],
    patterns: ["faceted-browse", "typo-browse"],
    derivedFrom: { surface: "Studio > Catalog", capturedOn: "2026-08-21" },
  };
  const index = buildPatternIndex(ctx, [...recipes, partial]);
  const entry = index.recipesNamingMissingPatterns.find(
    (e) => e.recipe.slug === "partly-wrong",
  );
  assert.ok(entry, "a partly-resolving capture is still reported");
  assert.deepEqual(entry.missing, ["typo-browse"]);
  // And the half that does resolve still attaches to its pattern.
  const faceted = index.patterns.find((p) => p.slug === "faceted-browse");
  assert.ok(faceted?.recipes.some((r) => r.slug === "partly-wrong"));
});

test("a capture declaring no pattern is its own finding, not an empty missing list", () => {
  const nameless: RecipeDoc = { slug: "nameless-capture", apps: ["studio"] };
  const index = buildPatternIndex(ctx, [...recipes, nameless]);
  assert.deepEqual(
    index.recipesNamingNoPattern.map((r) => r.slug),
    ["nameless-capture"],
  );
  assert.ok(
    !index.recipesNamingMissingPatterns.some(
      (e) => e.recipe.slug === "nameless-capture",
    ),
    "a capture with no names is not reported as naming a missing pattern",
  );
});

test("an app with no use cases still reports the patterns that claim it", () => {
  const index = buildPatternIndex(ctx, recipes);
  const explorer = index.apps.find((a) => a.slug === "explorer");
  assert.ok(explorer);
  assert.equal(explorer.useCases.length, 0);
  assert.deepEqual(
    explorer.unreachedPatterns.map((p) => p.slug),
    ["right-sliding-drawer"],
  );
  assert.deepEqual(explorer.sidebar, []);
});

test("apps are ordered by label and patterns by label within each list", () => {
  const index = buildPatternIndex(ctx, recipes);
  assert.deepEqual(
    index.apps.map((a) => a.slug),
    ["explorer", "studio"],
  );
  const studio = index.apps.find((a) => a.slug === "studio");
  assert.deepEqual(
    studio?.unreachedPatterns.map((p) => p.label),
    ["Faceted browse", "Right sliding drawer"],
  );
});

test("a pattern claiming an app the context does not define is reported", () => {
  const withStray: AppContextDoc = {
    apps: ctx.apps,
    patterns: {
      ...ctx.patterns,
      stray: { label: "Stray", apps: ["administration"] },
    },
  };
  const index = buildPatternIndex(withStray, recipes);
  assert.deepEqual(index.patternsClaimingUnknownApps, [
    { pattern: "stray", apps: ["administration"] },
  ]);
});

// ---------------------------------------------------------------------------
// The reviewable body of a capture. `loadRecipes` already parses the whole
// recipe file; until now `RecipeDoc` typed only the join keys, so the prose a
// Design Lead reviews (the slots, the render notes, the when clause) was read
// off disk and then dropped on the floor. These assert it reaches the row.

const fullRecipe: RecipeDoc = {
  slug: "asset-detail-360",
  label: "Asset detail 360",
  apps: ["studio"],
  patterns: ["asset-detail-360"],
  description: "A detail page for one asset.",
  when: "Use when the reader needs the whole of one asset in one place.",
  tags: ["detail", "tabs"],
  derivedFrom: {
    surface: "Studio > Catalog > Asset > Overview",
    capturedOn: "2026-08-19",
    productVersion: "next.dev.zeenea.app/studio",
  },
  slots: {
    header: "Asset title over the technical path.",
    tabs: "A tab bar whose labels carry result counts.",
  },
  renderNotes: [
    "Do NOT compose this from fmDialog: it is a stub.",
    "fmTabs renders no count badge.",
  ],
};

test("a capture carries its when clause, description and tags onto the pattern row", () => {
  const index = buildPatternIndex(ctx, [fullRecipe]);
  const row = index.patterns.find((p) => p.slug === "asset-detail-360");
  const capture = row?.recipes.find((r) => r.slug === "asset-detail-360");
  assert.ok(capture);
  assert.equal(
    capture.when,
    "Use when the reader needs the whole of one asset in one place.",
  );
  assert.equal(capture.description, "A detail page for one asset.");
  assert.deepEqual(capture.tags, ["detail", "tabs"]);
});

test("a capture carries its slots as an ordered name-and-prose list", () => {
  const index = buildPatternIndex(ctx, [fullRecipe]);
  const capture = index.patterns
    .find((p) => p.slug === "asset-detail-360")
    ?.recipes.find((r) => r.slug === "asset-detail-360");
  assert.deepEqual(capture?.slots, [
    { name: "header", description: "Asset title over the technical path." },
    { name: "tabs", description: "A tab bar whose labels carry result counts." },
  ]);
});

test("a capture carries its render notes, the sharpest prose in the file", () => {
  const index = buildPatternIndex(ctx, [fullRecipe]);
  const capture = index.patterns
    .find((p) => p.slug === "asset-detail-360")
    ?.recipes.find((r) => r.slug === "asset-detail-360");
  assert.deepEqual(capture?.renderNotes, [
    "Do NOT compose this from fmDialog: it is a stub.",
    "fmTabs renders no count badge.",
  ]);
});

test("a capture carries the product version it was taken from", () => {
  const index = buildPatternIndex(ctx, [fullRecipe]);
  const capture = index.patterns
    .find((p) => p.slug === "asset-detail-360")
    ?.recipes.find((r) => r.slug === "asset-detail-360");
  assert.equal(capture?.productVersion, "next.dev.zeenea.app/studio");
});

test("a capture with no slots or render notes yields empty lists, never undefined", () => {
  // The panel maps over these. An undefined here is a crash in the reader, and
  // three of the four recipes on disk predate some of these fields.
  const index = buildPatternIndex(ctx, [
    { slug: "bare", patterns: ["asset-detail-360"] },
  ]);
  const capture = index.patterns
    .find((p) => p.slug === "asset-detail-360")
    ?.recipes.find((r) => r.slug === "bare");
  assert.ok(capture);
  assert.deepEqual(capture.slots, []);
  assert.deepEqual(capture.renderNotes, []);
  assert.deepEqual(capture.tags, []);
  assert.equal(capture.when, null);
  assert.equal(capture.description, null);
  assert.equal(capture.productVersion, null);
});
