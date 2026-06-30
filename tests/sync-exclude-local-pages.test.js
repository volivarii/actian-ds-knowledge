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
      "notes-feedback": { name: "Notes/Feedback", page: "Local components" },
      breadcrumbs: { name: "Breadcrumbs", page: "Navigation" },
    },
  };
}

test("DENIED_PAGES includes the Local components scratch page", function () {
  assert.ok(DENIED_PAGES.includes("Local components"));
});

test("excludeDeniedPages drops components on a denied page, keeps the rest", function () {
  var out = excludeDeniedPages(fixtureRegistry(), DENIED_PAGES);
  assert.deepEqual(Object.keys(out.components).sort(), ["breadcrumbs", "side-nav"]);
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
