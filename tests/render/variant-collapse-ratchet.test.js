"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const mergeBase = require("./helpers/merge-base.js");
const collapse = require("./helpers/variant-collapse.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONTRACT_REL = "components/render/dist/render-contract.json";
// The committed dist is stale by construction on a branch that has not yet run
// its own derive: derive in process instead of requiring the file on disk, so
// this measures what the renderer produces NOW against what was committed at
// the merge base, regardless of whether the dist has been regenerated yet.
const { deriveContract } = require(
  path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
);
const fresh = deriveContract();

// State axes are excluded and only reported. Roughly half of their values collapse,
// but a static fragment cannot show hover or focus without forced-state classes,
// so gating them would fail on a limitation of the medium rather than a defect.
// The predicate itself lives in helpers/variant-collapse.js, with the set logic
// that uses it.

// Collapses the renderer makes ON PURPOSE, each with the reason it makes them.
//
// Why this exists: the gate used to report one undifferentiated count, so a
// documented decision and a silent substitution were the same number. Seven of
// the collapses are explained IN THE RENDERER'S OWN SOURCE, which means the gate
// was contradicting the code it measures. Naming them here leaves the reported
// figure meaning one thing: values the renderer cannot tell apart and nobody has
// said why.
//
// Keyed by the exact value, not by the slug, so a reason cannot drift onto a
// different regression in the same component. Every key is asserted below to
// still name a real collapse, so one left behind by a fix cannot quietly cover
// the next one. A key with an empty reason excuses nothing.
//
// This is a decision record, not a tally: it must never grow a count, a
// threshold, or an entry whose reason is "known issue".
const BY_DESIGN = {
  // ds-html-map.js, case "spinner": "Complete = 25%|50%|75%|100% is the
  // animation's own arc-fill cycle, not a chooseable variant (usage guideline),
  // so it is ignored here."
  "spinner Complete=25%": "an animation keyframe, not a chooseable variant",
  "spinner Complete=75%": "an animation keyframe, not a chooseable variant",
  "spinner Complete=100%": "an animation keyframe, not a chooseable variant",
  // ds-html-map.js, case "loader": "Registry axis: Percent (auto-named
  // variants). 'loader' is the indeterminate activity spinner (determinate
  // progress is the progress-bar-small leaf)."
  "loader Percent=10%":
    "loader is the INDETERMINATE spinner; determinate progress is progress-bar-small",
  "loader Percent=Percent3":
    "loader is the INDETERMINATE spinner, and Percent3 is an auto-named Figma value",
  // ds-html-map.js, case "search-result-card": "Studio's structural swaps
  // (button -> progress-bar-small, digram -> tag-default) are intentionally NOT
  // built here, per the spec. App=Studio therefore renders the BASE card with no
  // root modifier -- there is no built CSS delta for it, and a modifier class
  // must not be emitted without one."
  "search-result-card App=Studio":
    "Studio's structural swaps are not built, and a modifier class must not be emitted with no CSS delta",
  // ds-html-map.js, case "whats-new-dropdown": "The guideline collapses
  // Drilldown1+Drilldown2 into one 'Drilldown' concept, so normalize both onto a
  // single wnMode."
  "whats-new-dropdown Property 1=Drilldown2":
    "the guideline folds Drilldown1 and Drilldown2 into one Drilldown concept",
};

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function countBySlug(contract) {
  const out = {};
  Object.keys(contract.slugs || {}).forEach(function (slug) {
    out[slug] = 0;
  });
  collapse.collapseKeys(contract).forEach(function (key) {
    const slug = key.slice(0, key.indexOf(" "));
    out[slug] = (out[slug] || 0) + 1;
  });
  return out;
}

// The baseline is the contract at the merge base, not at HEAD: see
// helpers/merge-base.js, which owns that resolution for both render ratchets.
function baselineContract() {
  return mergeBase.jsonAtMergeBase(CONTRACT_REL);
}

test("no variant value newly renders identically to a sibling", function () {
  const at = baselineContract();
  if (!at.json) {
    // A missing baseline is a real condition but it must fail loudly rather
    // than pass silently: a silent return here would mean the ratchet asserted
    // nothing while still going green. The message names which of the three
    // ways it came up empty.
    assert.fail(mergeBase.describeMissing("variant-collapse-ratchet", at));
  }

  // Compared as a SET of values, not as a count per slug. A count cannot see a
  // swap: give one collapsed value its own rendering, introduce a collapse on
  // another value of the same component, and the number is unchanged while the
  // gallery still shows a duplicate cell. This names the value instead.
  const appeared = collapse.newCollapses(at.json, fresh, BY_DESIGN);

  assert.deepEqual(
    appeared,
    [],
    "these variant values now render identically to a sibling and did not at " +
      "the merge base, so a caller who asks for them receives a different " +
      "component than the one they named: " +
      JSON.stringify(appeared) +
      ". Give each value its own rendering in ds-html-map.js, or, if the values " +
      "really do render alike now, add the value to BY_DESIGN with the reason.",
  );
});

test("identity-axis variant collapse does not rise in total", function () {
  const at = baselineContract();
  if (!at.json) {
    assert.fail(mergeBase.describeMissing("variant-collapse-ratchet", at));
  }
  const before = countBySlug(at.json);
  const after = countBySlug(fresh);

  const sum = function (o) {
    return Object.keys(o).reduce(function (a, k) {
      return a + o[k];
    }, 0);
  };
  const totalBefore = sum(before);
  const totalAfter = sum(after);

  // Kept alongside the per-value check above, and not replaced by it, because
  // the two fail on different things. The per-value check skips slugs the
  // baseline does not carry, which is what keeps a RENAME from reddening a gate
  // with nothing to fix -- but that same skip means a collapse arriving inside a
  // renamed component is invisible to it. This crude total is rename-immune and
  // catches exactly that. The same pairing was reached the hard way on the
  // plugin's blank-box baseline, where a name-keyed comparison alone let a rename
  // hide an increase.
  //
  // Headroom, so the total never reds for something the per-value check has
  // already allowed: slugs the baseline did not have, plus values named in
  // BY_DESIGN.
  const headroom = Object.keys(after).reduce(function (a, slug) {
    if (!hasOwn(before, slug)) return a + after[slug];
    return a;
  }, 0);
  const waived = Object.keys(BY_DESIGN).filter(function (key) {
    return !collapse.collapseKeys(at.json).has(key);
  }).length;

  assert.ok(
    totalAfter - headroom - waived <= totalBefore,
    "identity-axis variant collapse rose from " +
      totalBefore +
      " to " +
      totalAfter +
      " values rendering identically to a sibling (" +
      headroom +
      " of the rise is already allowed as slugs absent from the baseline, and " +
      waived +
      " as values newly named in BY_DESIGN). Give the collapsed values their " +
      "own rendering, or name them in BY_DESIGN with a reason.",
  );
  assert.ok(
    Object.keys(after).length > 0,
    "this ratchet compared no slugs, so it would pass vacuously",
  );
});

test("every by-design collapse still names a real one", function () {
  const stale = collapse.staleExemptions(fresh, BY_DESIGN);
  assert.deepEqual(
    stale,
    [],
    "these BY_DESIGN entries no longer name a collapse the contract has, so " +
      "they excuse nothing and would cover the next regression on the same " +
      "value: " +
      JSON.stringify(stale) +
      ". Remove them.",
  );
  // The map above is populated, so the assertion can fail on its own contents.
  // The fabricated key still runs the predicate over something known-absent, to
  // prove a stale entry is actually detected rather than the check reporting an
  // all-clear from a broken comparison.
  assert.deepEqual(
    collapse.staleExemptions(fresh, {
      "no-such-component Axis=Value": "fabricated",
    }),
    ["no-such-component Axis=Value"],
    "the staleness predicate must report an entry the contract does not have",
  );
});

test("the reported collapse figure counts only unexplained values", function (t) {
  const report = collapse.classify(fresh, BY_DESIGN);

  // Deliberately NOT asserting the current totals. A pinned number here would be
  // a hand-maintained count standing in for a fact the contract already knows,
  // which is the anti-pattern this gate family exists to remove; it would also
  // have to be edited by every legitimate fix. What is asserted is the RELATION
  // between the parts, which holds at any size.
  assert.equal(
    report.clamps.length + report.twins.length,
    report.exempt.length + report.unexplained.length,
    "every collapse must be classified both ways: clamp-or-twin, and " +
      "explained-or-not",
  );
  assert.ok(
    report.exempt.length === Object.keys(BY_DESIGN).length,
    "every BY_DESIGN entry should have matched a real collapse; the staleness " +
      "test above names any that did not",
  );

  // Derived and printed rather than stored, so `npm test` output carries the
  // current split without anything having to be kept in step by hand.
  t.diagnostic(
    "variant collapse: " +
      report.unexplained.length +
      " unexplained (" +
      report.clamps.length +
      " clamp / " +
      report.twins.length +
      " twin, " +
      report.exempt.length +
      " explained by design)",
  );
});
