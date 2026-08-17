"use strict";

// Which variant values the renderer cannot tell apart, as a SET rather than a
// count.
//
// The ratchet this serves used to compare counts per slug. A count cannot see a
// swap: fix one collapsed value and introduce another in the same slug and the
// number is unchanged, so the regression ships green. Comparing the identities
// of the collapsed values catches that, and it names the value in the failure
// instead of leaving a reader to diff two numbers.

// Verbatim the predicate the ratchet has always used. State axes are excluded
// because a static fragment cannot show hover or focus without forced-state
// classes, so gating them would fail on a limitation of the medium.
const STATE_AXIS = /^(state|states)$/i;

function isStateAxis(axis) {
  return STATE_AXIS.test(axis.replace(/[^a-z]/gi, ""));
}

// "<slug> <axis>=<value>", the value a reader would set to reproduce it.
function keyFor(slug, axis, value) {
  return slug + " " + axis + "=" + value;
}

function collapseKeys(contract) {
  const out = new Set();
  const slugs = (contract && contract.slugs) || {};
  Object.keys(slugs).forEach(function (slug) {
    const variants = slugs[slug].variants || {};
    Object.keys(variants).forEach(function (axis) {
      if (isStateAxis(axis)) return;
      const rendersAs = variants[axis].rendersAs || {};
      Object.keys(rendersAs).forEach(function (value) {
        out.add(keyFor(slug, axis, value));
      });
    });
  });
  return out;
}

// A collapse is a CLAMP when the value falls back to the axis's own first value,
// and a TWIN when it matches some other sibling.
//
// The distinction is the difference between a defect and a fact. A clamp hands
// back a different component than the caller asked for: request
// `card-for-items Type=Glossary type` and receive the Catalog card, silently,
// which is the shape of the alert-banner Error defect fixed in #540. A twin says
// two non-default values genuinely render alike, which a redesign can make true
// and which the renderer must not invent a difference to hide.
// An exemption counts only when it carries a reason. Same rule as the coverage
// gate's --accept-coverage-loss="<why>", where the reasonless flag accepts
// nothing: a bare key would let a collapse through on an edit that records no
// decision, which is the difference between a documented exception and a
// silenced signal.
function isExplained(exemptions, key) {
  const reason = exemptions && exemptions[key];
  return typeof reason === "string" && reason.trim() !== "";
}

// A collapse is a CLAMP when the value falls back to the axis's own first value,
// and a TWIN when it matches some other sibling.
//
// The distinction is the difference between a defect and a fact. A clamp hands
// back a different component than the caller asked for: request
// `card-for-items Type=Glossary type` and receive the Catalog card, silently,
// which is the shape of the alert-banner Error defect fixed in #540. A twin says
// two non-default values genuinely render alike, which a redesign can make true
// and which the renderer must not invent a difference to hide.
function classify(contract, exemptions) {
  const clamps = [];
  const twins = [];
  const exempt = [];
  const unexplained = [];
  const slugs = (contract && contract.slugs) || {};
  Object.keys(slugs).forEach(function (slug) {
    const variants = slugs[slug].variants || {};
    Object.keys(variants).forEach(function (axis) {
      if (isStateAxis(axis)) return;
      const values = variants[axis].values || [];
      const rendersAs = variants[axis].rendersAs || {};
      Object.keys(rendersAs).forEach(function (value) {
        const key = keyFor(slug, axis, value);
        (rendersAs[value] === values[0] ? clamps : twins).push(key);
        (isExplained(exemptions, key) ? exempt : unexplained).push(key);
      });
    });
  });
  return {
    clamps: clamps.sort(),
    twins: twins.sort(),
    exempt: exempt.sort(),
    unexplained: unexplained.sort(),
  };
}

// Exemption keys that no longer name a collapse the contract has.
//
// The mirror of the ratchet's existing "every accepted rise still names a real
// slug" check, and it exists for the same reason: once a value gains its own
// rendering, the entry excusing it excuses nothing, and left behind it would
// quietly cover the next regression on that key.
function staleExemptions(contract, exemptions) {
  const present = collapseKeys(contract);
  return Object.keys(exemptions || {})
    .filter(function (key) {
      return !present.has(key);
    })
    .sort();
}

// Collapsed values present now and absent at the baseline.
//
// Slugs the baseline does not carry are skipped, which the count-keyed
// comparison did implicitly by requiring the slug on both sides. Two real cases
// need it: a component the Figma sync just added, whose collapse is a new fact
// rather than a regression, and a component that arrived under a new NAME, where
// every key is unseen and a set comparison would otherwise red a rename that has
// nothing to fix. The identity ledger (#553) exists so a rename lands additively,
// and this keeps that true here.
// A new collapse can be legitimate: a redesign can genuinely make two values
// render alike, and the renderer must not invent a difference the design system
// does not have. `exemptions` is the escape hatch, and it is keyed by the exact
// VALUE rather than by the slug so that a reason cannot also cover a different
// regression in the same component later.
function newCollapses(before, after, exemptions) {
  const had = collapseKeys(before);
  const knownSlugs = new Set(Object.keys((before && before.slugs) || {}));
  return Array.from(collapseKeys(after))
    .filter(function (k) {
      return (
        knownSlugs.has(slugOf(k)) && !had.has(k) && !isExplained(exemptions, k)
      );
    })
    .sort();
}

// Keys are "<slug> <axis>=<value>" and only the slug is free of spaces, so the
// first space is the boundary. Axis names contain spaces ("Size & Type",
// "Built type") and so do values, which is why this splits once rather than
// splitting on every space.
function slugOf(key) {
  return key.slice(0, key.indexOf(" "));
}

module.exports = {
  STATE_AXIS: STATE_AXIS,
  isStateAxis: isStateAxis,
  collapseKeys: collapseKeys,
  newCollapses: newCollapses,
  classify: classify,
  staleExemptions: staleExemptions,
};
