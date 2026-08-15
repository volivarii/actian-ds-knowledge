"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const mergeBase = require("./helpers/merge-base.js");

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
const STATE_AXIS = /^(state|states)$/i;

// Escape hatch, the same shape the coverage gate uses for
// --accept-coverage-loss="<why>" and the emptiness gate uses for its EXEMPT map:
// a rise is allowed only by naming the slug with a reason, so the decision to
// ship duplicate cells reads like a decision in the diff. A rise can be
// legitimate, since a redesign can genuinely make two values render alike and
// the renderer must not invent a difference the design system does not have.
// It may not be silent.
//
// Each key must still name a real slug in the contract, asserted below, so a
// key left behind by a rename cannot quietly cover a different regression later.
const ACCEPTED_RISE = {
  // "some-slug": "why this component's values legitimately render alike now",
};

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function collapseBySlug(contract) {
  const out = {};
  Object.keys(contract.slugs || {}).forEach(function (slug) {
    let n = 0;
    const variants = contract.slugs[slug].variants || {};
    Object.keys(variants).forEach(function (axis) {
      if (STATE_AXIS.test(axis.replace(/[^a-z]/gi, ""))) return;
      n += Object.keys(variants[axis].rendersAs || {}).length;
    });
    out[slug] = n;
  });
  return out;
}

// The baseline is the contract at the merge base, not at HEAD: see
// helpers/merge-base.js, which owns that resolution for both render ratchets.
// It used to live here in full, and a second copy of it went into the sparse
// ratchet before the duplication was noticed. The whole resolution attempt is
// returned, not just the JSON, so the failure below can say WHICH way it came
// up empty: an unresolvable merge base and a merge base that simply does not
// carry the file are different diagnoses, and the second used to be reported as
// the first.
function baselineContract() {
  return mergeBase.jsonAtMergeBase(CONTRACT_REL);
}

// Baseline at the merge base when this ratchet landed: 57 of 236 identity-axis
// values collapse (24.2%), across 19 fully flat axes. State axes, excluded here,
// collapse at 51.6%. Both re-derived rather than restated.

test("variant collapse does not increase, per slug or in total", function () {
  const at = baselineContract();
  if (!at.json) {
    // A missing baseline is a real condition but it must fail loudly rather
    // than pass silently: a silent return here would mean the ratchet asserted
    // nothing while still going green. The message names which of the three
    // ways it came up empty.
    assert.fail(mergeBase.describeMissing("variant-collapse-ratchet", at));
  }
  const before = collapseBySlug(at.json);
  const after = collapseBySlug(fresh);

  const worse = Object.keys(after)
    .filter(function (slug) {
      return (
        hasOwn(before, slug) &&
        after[slug] > before[slug] &&
        !hasOwn(ACCEPTED_RISE, slug)
      );
    })
    .map(function (slug) {
      return slug + ": " + before[slug] + " -> " + after[slug];
    });

  const sum = function (o) {
    return Object.keys(o).reduce(function (a, k) {
      return a + o[k];
    }, 0);
  };
  const totalBefore = sum(before);
  const totalAfter = sum(after);

  // Headroom, so the total never reds for something the per-slug check has
  // already allowed. Two sources:
  //
  //   1. Slugs the baseline did not have. A newly added component's collapse is
  //      a NEW FACT, not a regression, and the per-slug check above deliberately
  //      skips it. 19 of the current identity axes are fully flat, so a Figma
  //      sync adding a component with a flat axis is the common case, and with
  //      zero headroom it would red a required check with no documented remedy.
  //   2. Rises named in ACCEPTED_RISE, which were allowed with a reason.
  //
  // Slugs that DISAPPEAR need no headroom: they only lower the total.
  const headroom = Object.keys(after).reduce(function (a, slug) {
    if (!hasOwn(before, slug)) return a + after[slug];
    if (hasOwn(ACCEPTED_RISE, slug) && after[slug] > before[slug]) {
      return a + (after[slug] - before[slug]);
    }
    return a;
  }, 0);

  assert.deepEqual(
    worse,
    [],
    "these components now render more variant values identically than they did at " +
      "the merge base, so the gallery shows duplicate cells for values the design " +
      "system distinguishes: " +
      JSON.stringify(worse) +
      ". Give the value its own rendering in ds-html-map.js, or, if the values " +
      "really do render alike now, add the slug to ACCEPTED_RISE with a reason.",
  );
  assert.ok(
    totalAfter - headroom <= totalBefore,
    "identity-axis variant collapse rose from " +
      totalBefore +
      " to " +
      totalAfter +
      " values rendering identically to a sibling (" +
      headroom +
      " of the rise is already allowed: slugs absent from the baseline, plus " +
      "any named in ACCEPTED_RISE). Give the collapsed values their own " +
      "rendering, or name the slug in ACCEPTED_RISE with a reason.",
  );
  assert.ok(
    Object.keys(after).length > 0,
    "this ratchet compared no slugs, so it would pass vacuously",
  );
});

function unknownSlugs(map, contract) {
  return Object.keys(map).filter(function (slug) {
    return !hasOwn(contract.slugs || {}, slug);
  });
}

test("every accepted rise still names a real slug", function () {
  assert.deepEqual(
    unknownSlugs(ACCEPTED_RISE, fresh),
    [],
    "accepted rises the contract no longer has: " +
      JSON.stringify(unknownSlugs(ACCEPTED_RISE, fresh)),
  );
  // ACCEPTED_RISE is empty at landing, so the assertion above cannot fail on its
  // own contents and would read as an all-clear from a broken predicate just as
  // easily as from an empty map. Run the same predicate over a fabricated key to
  // prove it CAN fail.
  assert.deepEqual(
    unknownSlugs({ "no-such-component": "fabricated" }, fresh),
    ["no-such-component"],
    "the staleness predicate must report a slug the contract does not have",
  );
});
