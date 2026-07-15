"use strict";
// ---------------------------------------------------------------------------
// Durable resilience against a churning Figma file (2026-07-15, issue #425).
//
// Category is inferred every night from the Figma Pages panel (a Title-Case
// header page sets the category for the member pages beneath it). During an
// active reorg the page names/positions churn, so a component that still
// exists in the published library comes back with its category dropped to
// null or re-derived to a non-category (its own page name). The published
// component is NOT lost; it is re-bucketed. Two failures followed:
//
//   1. The mass-loss tripwire, keyed on category COUNT hitting 0, red the
//      nightly sync (Feedback 11->0, Data Display 31->0, Form 11->0) even
//      though every one of those components was still present.
//   2. If we merely stop the tripwire, the survivors ship UNCATEGORIZED and
//      fall out of categories.json, the docs page tree, and the graph.
//
// The fix has two independent halves, tested here:
//   - assertNoCategoryMassLoss becomes REMOVAL-based: a category is only
//     "lost" when >= FLOOR of its members are genuinely ABSENT by identity,
//     not merely re-bucketed. Reshuffles never red the nightly again.
//   - preserveKnownCategories carries a survivor's last-known category
//     forward (by stable identity: key -> nodeId -> slug) whenever this
//     sync failed to attribute a valid one, so the component stays
//     categorized. It self-retires: a stable file produces zero drift.
// ---------------------------------------------------------------------------
var test = require("node:test");
var assert = require("node:assert/strict");
var S = require("../scripts/sync/sync-from-figma.js");

// A survivor keeps its stable Figma identity (key) across a page move.
function comp(key, category, extra) {
  return Object.assign({ key: key, category: category }, extra || {});
}

// ---- assertNoCategoryMassLoss: removal-based ------------------------------

test("assertNoCategoryMassLoss: a reshuffle (survivors present, category dropped to null) is NOT a loss", function () {
  var before = { components: {} };
  var after = { components: {} };
  for (var i = 0; i < 11; i++) {
    before.components["fb" + i] = comp("k" + i, "Feedback");
    // Same 11 components survive by identity; a page rename dropped the category.
    after.components["fb" + i] = comp("k" + i, null);
  }
  assert.doesNotThrow(function () {
    S.assertNoCategoryMassLoss(before, after, { allow: [] });
  });
});

test("assertNoCategoryMassLoss: a reshuffle to a non-category (page name) is NOT a loss", function () {
  var before = { components: {} };
  var after = { components: {} };
  for (var i = 0; i < 11; i++) {
    before.components["fb" + i] = comp("k" + i, "Feedback");
    after.components["fb" + i] = comp("k" + i, "Toast control"); // garbage bucket, still present
  }
  assert.doesNotThrow(function () {
    S.assertNoCategoryMassLoss(before, after, { allow: [] });
  });
});

test("assertNoCategoryMassLoss: >= FLOOR members genuinely absent (removed from Figma) throws", function () {
  var before = { components: {} };
  for (var i = 0; i < 11; i++)
    before.components["fb" + i] = comp("k" + i, "Feedback");
  var after = { components: {} }; // every one gone
  assert.throws(function () {
    S.assertNoCategoryMassLoss(before, after, { allow: [] });
  }, /mass-loss/);
});

test("assertNoCategoryMassLoss: genuine deletions still trip even when one straggler moved out", function () {
  var before = { components: {} };
  for (var i = 0; i < 11; i++)
    before.components["fb" + i] = comp("k" + i, "Feedback");
  // fb0 moved to Overlays (present, key matches); the other 10 are deleted.
  var after = { components: { fb0: comp("k0", "Overlays") } };
  assert.throws(function () {
    S.assertNoCategoryMassLoss(before, after, { allow: [] });
  }, /mass-loss/);
});

// ---- preserveKnownCategories ----------------------------------------------

test("preserveKnownCategories: restores the whole attribution block for a survivor whose category is null", function () {
  var before = {
    components: {
      toast: comp("k1", "Feedback", {
        categorySlug: "feedback",
        section: "Components",
        group: "Toast",
        status: "stable",
      }),
    },
  };
  var after = { components: { toast: comp("k1", null) } };
  var drift = S.preserveKnownCategories(before, after);
  // category alone is not enough: section/group/status ship in registry.json
  // and are consumed by the docs page tree and the status badge.
  assert.equal(after.components.toast.category, "Feedback");
  assert.equal(after.components.toast.categorySlug, "feedback");
  assert.equal(after.components.toast.section, "Components");
  assert.equal(after.components.toast.group, "Toast");
  assert.equal(after.components.toast.status, "stable");
  assert.equal(drift.length, 1);
  assert.equal(drift[0].from, "Feedback");
});

test("preserveKnownCategories: reconciles a stale section/group/status left by the drifted bucket", function () {
  var before = {
    components: {
      toast: comp("k1", "Feedback", {
        categorySlug: "feedback",
        section: "Components",
        group: "Toast",
        // twin has NO status (stable components omit the field)
      }),
    },
  };
  // The drift landed toast on a section-bearing non-category page, so transform
  // gave it a mismatched section/group and a stray status alongside a null
  // category. Restore must overwrite section/group AND drop the stray status,
  // not leave an inconsistent section/category/group/status quartet.
  var after = {
    components: {
      toast: comp("k1", null, {
        section: "Foundations",
        group: "Wrong",
        status: "beta",
      }),
    },
  };
  S.preserveKnownCategories(before, after);
  assert.equal(after.components.toast.category, "Feedback");
  assert.equal(after.components.toast.section, "Components");
  assert.equal(after.components.toast.group, "Toast");
  assert.equal("status" in after.components.toast, false); // stray status dropped
});

test("preserveKnownCategories: restores when the new bucket is a non-category (page name)", function () {
  var before = {
    components: { toast: comp("k1", "Feedback", { categorySlug: "feedback" }) },
  };
  var after = { components: { toast: comp("k1", "Toast control") } };
  var drift = S.preserveKnownCategories(before, after);
  assert.equal(after.components.toast.category, "Feedback");
  assert.equal(drift.length, 1);
  assert.equal(drift[0].observed, "Toast control");
});

test("preserveKnownCategories: trusts a valid move to a different established category", function () {
  var before = {
    components: {
      toast: comp("k1", "Feedback", { categorySlug: "feedback" }),
      popover: comp("k2", "Overlays", { categorySlug: "overlays" }),
    },
  };
  // toast deliberately moved to Overlays, which is an established category.
  var after = { components: { toast: comp("k1", "Overlays") } };
  var drift = S.preserveKnownCategories(before, after);
  assert.equal(after.components.toast.category, "Overlays");
  assert.equal(drift.length, 0);
});

test("preserveKnownCategories: leaves a genuinely new uncategorized component alone", function () {
  var before = { components: { toast: comp("k1", "Feedback") } };
  var after = {
    components: {
      toast: comp("k1", "Feedback"),
      brandnew: comp("k9", null),
    },
  };
  var drift = S.preserveKnownCategories(before, after);
  assert.equal(after.components.brandnew.category, null);
  assert.equal(drift.length, 0);
});

test("preserveKnownCategories: a stable file produces zero drift and no changes (self-retiring)", function () {
  var before = {
    components: { toast: comp("k1", "Feedback", { categorySlug: "feedback" }) },
  };
  var after = {
    components: { toast: comp("k1", "Feedback", { categorySlug: "feedback" }) },
  };
  var drift = S.preserveKnownCategories(before, after);
  assert.equal(drift.length, 0);
  assert.equal(after.components.toast.category, "Feedback");
});

test("preserveKnownCategories then assertNoCategoryMassLoss: a page rename no longer reds the sync", function () {
  var before = { components: {} };
  var after = { components: {} };
  for (var i = 0; i < 11; i++) {
    before.components["fb" + i] = comp("k" + i, "Feedback", {
      categorySlug: "feedback",
    });
    after.components["fb" + i] = comp("k" + i, null); // page rename dropped the category
  }
  S.preserveKnownCategories(before, after);
  assert.equal(after.components.fb0.category, "Feedback"); // restored
  assert.doesNotThrow(function () {
    S.assertNoCategoryMassLoss(before, after, { allow: [] });
  });
});
