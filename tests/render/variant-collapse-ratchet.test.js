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

// Resolved ONCE for the whole file. merge-base.js can fall back to a real
// `git fetch`, which its own header calls slow and non-hermetic, and resolving
// per test would run that fetch once per test on a cold or fork-PR checkout.
const BASELINE = mergeBase.jsonAtMergeBase(CONTRACT_REL);

// State axes are excluded and only reported. Roughly half of their values
// collapse, but a static fragment cannot show hover or focus without
// forced-state classes, so gating them would fail on a limitation of the medium
// rather than a defect. The predicate lives in helpers/variant-collapse.js with
// the set logic that uses it, and has its own unit test there.

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
// still name a real collapse AND to carry a usable reason, so one left behind by
// a fix cannot quietly cover the next one.
//
// This is a decision record, not a tally: it must never grow a count, a
// threshold, or an entry whose reason is "known issue". A Figma value rename is
// a legitimate entry, but its reason must name the key it replaces.
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

function requireBaseline() {
  if (!BASELINE.json) {
    // A missing baseline is a real condition but it must fail loudly rather
    // than pass silently: a silent return here would mean the ratchet asserted
    // nothing while still going green. The message names which of the three
    // ways it came up empty.
    assert.fail(
      mergeBase.describeMissing("variant-collapse-ratchet", BASELINE),
    );
  }
  return BASELINE.json;
}

test("no two variant values start rendering identically", function () {
  const before = requireBaseline();

  // The whole gate, and it compares EQUIVALENCE CLASSES rather than counts or
  // aliases. A count cannot see a swap. An alias moves when Figma reorders an
  // axis, and it moves again when someone fixes the value a duplicate group was
  // anchored on, which would red the exact improvement this exists to
  // encourage. What neither of those touches is which values a caller cannot
  // tell apart, so that is what is asserted.
  const appeared = collapse.newlyIdentical(before, fresh, BY_DESIGN);

  assert.deepEqual(
    appeared,
    [],
    "these variant values render identically to each other and did not at the " +
      "merge base, so a caller who asks for one receives the other: " +
      JSON.stringify(appeared) +
      ". Give each value its own rendering in ds-html-map.js, or, if they " +
      "really do render alike now, add one of the two values to BY_DESIGN with " +
      "the reason.",
  );

  // The comparison must have had something to compare. Every filter above can
  // empty (an unrecognised contract shape, a state-axis predicate that starts
  // matching everything), and each of those failures is a silent pass.
  assert.ok(
    collapse.collapseKeys(fresh).size > 0,
    "this ratchet found no collapses at all in the fresh contract, so it would " +
      "pass vacuously; the contract shape or the axis predicate has changed",
  );
});

test("no slug or axis name can silently defeat the key format", function () {
  // Both failures this guards are SILENT PASSES rather than reds, which is the
  // only reason it is worth a test: a slug containing whitespace makes slugOf
  // return a prefix, so every collapse in that component is skipped, and an
  // axis containing "=" makes two different values share one key so one of them
  // stops being watched.
  const malformed = collapse.malformedNames(fresh);
  assert.deepEqual(
    malformed,
    [],
    "these names break the assumption the collapse key format rests on, and " +
      "would make the gate skip a component rather than fail: " +
      JSON.stringify(malformed),
  );

  // Every collapse key must also be unique, which is the other half of the same
  // assumption and is not implied by the name check alone.
  const keys = [];
  Object.keys(fresh.slugs).forEach(function (slug) {
    const variants = fresh.slugs[slug].variants || {};
    Object.keys(variants).forEach(function (axis) {
      if (collapse.isStateAxis(axis)) return;
      Object.keys(variants[axis].rendersAs || {}).forEach(function (value) {
        keys.push(slug + " " + axis + "=" + value);
      });
    });
  });
  assert.equal(
    new Set(keys).size,
    keys.length,
    "two collapses share one key, so one of them is invisible to this gate",
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
  // The map above is populated today, but emptying it is exactly what fixing
  // all seven looks like, and an assertion that only holds while it is
  // populated would quietly stop proving anything at that moment. The
  // fabricated key is independent of BY_DESIGN's contents.
  assert.deepEqual(
    collapse.staleExemptions(fresh, {
      "no-such-component Axis=Value": "fabricated",
    }),
    ["no-such-component Axis=Value"],
    "the staleness predicate must report an entry the contract does not have",
  );
});

test("every by-design collapse carries a usable reason", function () {
  const unusable = collapse.unusableExemptions(fresh, BY_DESIGN);
  assert.deepEqual(
    unusable,
    [],
    "these BY_DESIGN entries name a real collapse but carry no reason, so they " +
      "excuse nothing and the value is still counted: " +
      JSON.stringify(unusable) +
      ". Write the reason, or remove the entry.",
  );
  // Reported apart from staleness because the remedies are opposite, and
  // because an earlier version failed the reasonless case with a message
  // pointing at the staleness test, which was green and named nothing.
  //
  // The probe takes any real collapse rather than a BY_DESIGN key, so it still
  // proves the predicate fires once BY_DESIGN is empty.
  const anyRealKey = Array.from(collapse.collapseKeys(fresh)).sort()[0];
  const probe = {};
  probe[anyRealKey] = "   ";
  assert.deepEqual(
    collapse.unusableExemptions(fresh, probe),
    [anyRealKey],
    "the reason predicate must report an entry whose reason is only whitespace",
  );
});

test("the reported collapse figure counts only unexplained values", function (t) {
  const report = collapse.classify(fresh, BY_DESIGN);
  const all = Array.from(collapse.collapseKeys(fresh)).sort();

  // An earlier version asserted clamps+twins === exempt+unexplained, which
  // classify() makes true by construction: it pushes into one of each pair per
  // collapse, so the equality held for any input, including a completely broken
  // classification. These compare each partition against the collapse set it is
  // meant to partition, which a broken classify() fails. Neither side dedupes,
  // so a key collision fails both rather than only one.
  assert.deepEqual(
    report.clamps.concat(report.twins).sort(),
    all,
    "clamps and twins together must be exactly the collapses the contract has",
  );
  assert.deepEqual(
    report.exempt.concat(report.unexplained).sort(),
    all,
    "explained and unexplained together must be exactly the collapses the " +
      "contract has",
  );
  const both = report.clamps.filter(function (k) {
    return report.twins.indexOf(k) !== -1;
  });
  assert.deepEqual(both, [], "no value can be both a clamp and a twin");

  // Derived and printed rather than stored, so `npm test` output carries the
  // current split without anything having to be kept in step by hand.
  t.diagnostic(
    "variant collapse: " +
      all.length +
      " collapses = " +
      report.clamps.length +
      " clamp / " +
      report.twins.length +
      " twin; " +
      report.exempt.length +
      " explained by design, " +
      report.unexplained.length +
      " unexplained",
  );
});
