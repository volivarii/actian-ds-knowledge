"use strict";

// Guards the sync-time exclusion of Figma scratch/utility pages (e.g.
// "Local components", which held only the two-node "Notes/Feedback" label).
// Without it, such non-components leak into components/dist/registries/dskit.json
// AND the derived components/dist/categories.json as an orphan category.

var test = require("node:test");
var assert = require("node:assert/strict");
var sync = require("../scripts/sync/sync-from-figma.js");

var excludeDeniedPages = sync.excludeDeniedPages;
var DENIED_PAGES = sync.DENIED_PAGES;

function fixtureRegistry() {
  return {
    library: "DS Kit",
    fileKey: "abc",
    components: {
      "side-nav": { name: "Side nav", page: "Navigation" },
      // The name Figma reports today. The list still says "Local components",
      // and an exact-match implementation therefore keeps this component: that
      // is the leak this fixture exists to reproduce, so every drop assertion
      // below fails the moment the matcher stops handling a suffixed page.
      "notes-feedback": {
        name: "Notes/Feedback",
        page: "Local components + templates",
      },
      breadcrumbs: { name: "Breadcrumbs", page: "Navigation" },
    },
  };
}

test("DENIED_PAGES includes the Local components scratch page", function () {
  assert.ok(DENIED_PAGES.includes("Local components"));
});

test("excludeDeniedPages drops components on a denied page, keeps the rest", function () {
  var out = excludeDeniedPages(fixtureRegistry(), DENIED_PAGES);
  assert.deepEqual(Object.keys(out.components).sort(), [
    "breadcrumbs",
    "side-nav",
  ]);
  assert.equal(out.components["notes-feedback"], undefined);
  // Non-component fields are preserved.
  assert.equal(out.library, "DS Kit");
  assert.equal(out.fileKey, "abc");
});

test("excludeDeniedPages does not mutate its input", function () {
  var input = fixtureRegistry();
  excludeDeniedPages(input, DENIED_PAGES);
  assert.ok("notes-feedback" in input.components, "input must be untouched");
});

test("excludeDeniedPages keeps everything when no page matches", function () {
  var out = excludeDeniedPages(fixtureRegistry(), ["Nonexistent page"]);
  assert.equal(Object.keys(out.components).length, 3);
});

test("excludeDeniedPages tolerates null / missing components", function () {
  assert.equal(excludeDeniedPages(null, DENIED_PAGES), null);
  var noComps = { library: "x" };
  assert.equal(excludeDeniedPages(noComps, DENIED_PAGES), noComps);
});

// transformRegistry sets componentCount on the FULL set BEFORE this drop runs,
// so removing a scratch-page component here must recompute the count or dskit.json
// ships a stale componentCount (the v0.34.54 regression: 318 declared, 317 real).
test("excludeDeniedPages recomputes componentCount when it drops components", function () {
  var reg = fixtureRegistry();
  reg.componentCount = 3; // as transformRegistry set it, counting notes-feedback
  var out = excludeDeniedPages(reg, DENIED_PAGES);
  assert.equal(
    out.componentCount,
    2,
    "count must follow the 2 kept components, not the stale 3",
  );
});

test("excludeDeniedPages leaves componentCount absent when the input had none", function () {
  var reg = fixtureRegistry(); // no componentCount field
  var out = excludeDeniedPages(reg, DENIED_PAGES);
  assert.equal(
    "componentCount" in out,
    false,
    "must not invent a componentCount the input never had",
  );
});

// ---- A denied page that grows a suffix is still the denied page ----
//
// The DS Kit page went from "Local components" to "Local components + templates".
// `denied.includes(entry.page)` stopped matching, the run still went green (the
// stale-list message is a console.warn, not a gate), and Notes/Feedback published
// into dskit.json carrying a "Local components + templates" category of its own.

var isDeniedPage = sync.isDeniedPage;
var suppressDeniedPageCollisions = sync.suppressDeniedPageCollisions;

test("isDeniedPage matches the exact name and a suffixed one", function () {
  assert.equal(isDeniedPage("Local components", DENIED_PAGES), true);
  assert.equal(isDeniedPage("Local components + templates", DENIED_PAGES), true);
  assert.equal(
    isDeniedPage("  Local components + templates  ", DENIED_PAGES),
    true,
    "an indented page name is the same page",
  );
});

test("isDeniedPage requires a word boundary, so it cannot over-match", function () {
  assert.equal(
    isDeniedPage("Local componentsX", DENIED_PAGES),
    false,
    "a longer word that merely starts with the denied name is a different page",
  );
  assert.equal(isDeniedPage("Navigation", DENIED_PAGES), false);
  assert.equal(isDeniedPage(null, DENIED_PAGES), false);
  assert.equal(isDeniedPage("Local components", []), false, "an empty list denies nothing");
  assert.equal(
    isDeniedPage("anything at all", [""]),
    false,
    "an empty entry must not deny every page",
  );
});

// The exclusion and the collision suppressor both answer "is this page denied".
// They used to answer it with two separate expressions, which is one rename away
// from a registry that drops a component while its collision warning still fires.
test("the collision suppressor and the exclusion agree on a suffixed page", function () {
  var page = "Local components + templates";
  var kept = excludeDeniedPages(fixtureRegistry(), DENIED_PAGES).components;
  assert.equal(
    kept["notes-feedback"],
    undefined,
    "excluded from the registry",
  );

  var warnings = suppressDeniedPageCollisions(
    [
      {
        code: "SLUG_COLLISION_DROPPED",
        slug: "notes-feedback",
        droppedPage: page,
        droppedPageRaw: "     " + page,
      },
      {
        code: "SLUG_COLLISION_DROPPED",
        slug: "snowflake",
        droppedPage: "Third-party logos",
        droppedPageRaw: "Third-party logos",
      },
    ],
    DENIED_PAGES,
  );
  assert.deepEqual(
    warnings.map(function (w) {
      return w.slug;
    }),
    ["snowflake"],
    "a collision on the denied page is suppressed, a real one survives",
  );
});
