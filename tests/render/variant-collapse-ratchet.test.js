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

function countBySlug(contract) {
  const out = {};
  Object.keys(contract.slugs || {}).forEach(function (slug) {
    out[slug] = 0;
  });
  collapse.collapseKeys(contract).forEach(function (key) {
    const slug = collapse.slugOf(key);
    out[slug] = (out[slug] || 0) + 1;
  });
  return out;
}

test("no variant value newly renders identically to a sibling", function () {
  const before = requireBaseline();

  // Compared as a SET of values, not as a count per slug. A count cannot see a
  // swap: give one collapsed value its own rendering, introduce a collapse on
  // another value of the same component, and the number is unchanged while the
  // gallery still shows a duplicate cell. This names the value instead.
  const appeared = collapse.newCollapses(before, fresh, BY_DESIGN);

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

test("no collapsed value changes which sibling it renders as", function () {
  const before = requireBaseline();

  // The set check above cannot see this: the key is on both sides, so nothing
  // is new. What changed is the answer to the same request. A value that used
  // to duplicate a non-default sibling and now duplicates the shipped default
  // has become the "ask for Glossary type, receive Catalog" defect (#550), and
  // it would otherwise ship green.
  const moved = collapse.retargeted(before, fresh);

  assert.deepEqual(
    moved,
    [],
    "these values still collapse but now render as a DIFFERENT sibling, so " +
      "callers who ask for them get a different component back than they did " +
      "at the merge base: " +
      JSON.stringify(moved) +
      ". This is a behaviour change even though the collapse count did not move.",
  );
});

test("identity-axis variant collapse does not rise in total", function () {
  const before = countBySlug(requireBaseline());
  const after = countBySlug(fresh);

  const sum = function (o) {
    return Object.keys(o).reduce(function (a, k) {
      return a + o[k];
    }, 0);
  };
  const totalBefore = sum(before);
  const totalAfter = sum(after);
  const allowed = collapse.allowedRise(requireBaseline(), fresh, BY_DESIGN);

  // Kept alongside the per-value checks, and not replaced by them, because it
  // fails on something they cannot see: a collapse that arrives while its
  // component's NAME is unchanged but its axis or value names churn, which
  // leaves the per-value set comparison looking at keys it has never seen.
  //
  // 🪤 It is NOT rename-immune, and an earlier draft of this comment claimed it
  // was. A renamed component is a slug the baseline lacks, so `allowedRise`
  // credits every one of its collapses and a rise inside it passes both gates.
  // Closing that needs the identity ledger (components/dist/identity.json,
  // #553), which can tell a renamed slug from a new one. Left undone and stated
  // here rather than stubbed in, because a bound that cannot fire must not read
  // as one that can.
  assert.ok(
    totalAfter - allowed <= totalBefore,
    "identity-axis variant collapse rose from " +
      totalBefore +
      " to " +
      totalAfter +
      " values rendering identically to a sibling (" +
      allowed +
      " of the rise is already allowed: values on slugs absent from the " +
      "baseline, plus values newly named in BY_DESIGN). Give the collapsed " +
      "values their own rendering, or name them in BY_DESIGN with a reason.",
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
  const oneRealKey = Object.keys(BY_DESIGN)[0];
  const probe = {};
  probe[oneRealKey] = "   ";
  assert.deepEqual(
    collapse.unusableExemptions(fresh, probe),
    [oneRealKey],
    "the reason predicate must report an entry whose reason is only whitespace",
  );
});

test("the reported collapse figure counts only unexplained values", function (t) {
  const report = collapse.classify(fresh, BY_DESIGN);
  const all = collapse.collapseKeys(fresh);

  // An earlier version asserted clamps+twins === exempt+unexplained, which
  // classify() makes true by construction: it pushes into one of each pair per
  // collapse, so the equality held for any input, including a completely broken
  // classification. These compare the partitions against the collapse set they
  // are meant to partition, which a broken classify() fails.
  assert.deepEqual(
    report.clamps
      .concat(report.twins)
      .sort()
      .filter(function (k, i, a) {
        return a.indexOf(k) === i;
      }),
    Array.from(all).sort(),
    "clamps and twins together must be exactly the collapses the contract has",
  );
  assert.deepEqual(
    report.exempt.concat(report.unexplained).sort(),
    Array.from(all).sort(),
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
      all.size +
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
