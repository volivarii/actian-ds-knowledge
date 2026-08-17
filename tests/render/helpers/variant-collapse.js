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

// Keys are "<slug> <axis>=<value>" and only the slug is free of spaces, so the
// first space is the boundary. Axis names contain spaces ("Size & Type",
// "Built type") and so do values, which is why this splits once rather than
// splitting on every space. Exported because the ratchet needs the same rule,
// and a second inline copy of it is how the two drift apart.
function slugOf(key) {
  return key.slice(0, key.indexOf(" "));
}

// Walk every identity-axis collapse once. Both the set and the target map are
// built from this, so they cannot disagree about what counts as a collapse.
function eachCollapse(contract, visit) {
  const slugs = (contract && contract.slugs) || {};
  Object.keys(slugs).forEach(function (slug) {
    const variants = slugs[slug].variants || {};
    Object.keys(variants).forEach(function (axis) {
      if (isStateAxis(axis)) return;
      const values = variants[axis].values || [];
      const rendersAs = variants[axis].rendersAs || {};
      Object.keys(rendersAs).forEach(function (value) {
        visit(keyFor(slug, axis, value), rendersAs[value], values);
      });
    });
  });
}

function collapseKeys(contract) {
  const out = new Set();
  eachCollapse(contract, function (key) {
    out.add(key);
  });
  return out;
}

// key -> the sibling value it renders as.
function collapseTargets(contract) {
  const out = new Map();
  eachCollapse(contract, function (key, target) {
    out.set(key, target);
  });
  return out;
}

// An exemption counts only when it carries a reason. Same rule as the coverage
// gate's --accept-coverage-loss="<why>", where the reasonless flag accepts
// nothing: a bare key would let a collapse through on an edit that records no
// decision, which is the difference between a documented exception and a
// silenced signal.
function isExplained(exemptions, key) {
  const reason = exemptions && exemptions[key];
  return typeof reason === "string" && reason.trim() !== "";
}

// A collapse is a CLAMP when the value renders as the axis's FIRST-LISTED value,
// and a TWIN when it renders as some other sibling.
//
// 🪤 First-listed is a PROXY for "the default", not a record of it. Nothing in
// the pipeline stores a default: `values` is Figma's variantOptions in insertion
// order (scripts/transformers/transform-registry.js), and derive-contract.js
// aliases each duplicate group to the value it saw first. So for an axis the
// renderer ignores entirely, every value lands in one group containing the first
// value and the whole axis scores as clamps, even though nothing is "falling
// back" to anything. Read the split as "collapses onto the first-listed value"
// and not as proof of a default. What holds either way is the part that matters:
// the caller named a value and received the markup of a different one.
//
// The distinction still earns its keep because the two call for different
// responses. Where the first-listed value IS the shipped default, a clamp hands
// back a different component than the caller asked for: request
// `card-for-items Type=Glossary type` and receive the Catalog card, silently,
// which is the shape of the alert-banner Error defect fixed in #540. A twin says
// two non-default values render alike, which a redesign can make true and which
// the renderer must not invent a difference to hide.
function classify(contract, exemptions) {
  const clamps = [];
  const twins = [];
  const exempt = [];
  const unexplained = [];
  eachCollapse(contract, function (key, target, values) {
    (target === values[0] ? clamps : twins).push(key);
    (isExplained(exemptions, key) ? exempt : unexplained).push(key);
  });
  return {
    clamps: clamps.sort(),
    twins: twins.sort(),
    exempt: exempt.sort(),
    unexplained: unexplained.sort(),
  };
}

// Collapsed values present now and absent at the baseline.
//
// Slugs the baseline does not carry are skipped, which the count-keyed
// comparison did implicitly by requiring the slug on both sides. Two real cases
// need it: a component the Figma sync just added, whose collapse is a new fact
// rather than a regression, and a component that arrived under a new NAME, where
// every key is unseen and a set comparison would otherwise red a rename that has
// nothing to fix.
//
// 🪤 An axis or a value RENAME inside a known slug is not skipped and will be
// reported, because the old key disappears and a new one takes its place. That
// is a real event worth seeing (Figma auto-names values, and `Percent3` and
// `Property 1` in this very data are what that looks like), and the honest
// remedy is a BY_DESIGN entry whose reason says the value was renamed, naming
// the key it replaces.
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

// Values that collapsed before and collapse now, onto something DIFFERENT.
//
// The set comparison above cannot see this: the key is present on both sides, so
// nothing is new. What changed is the answer the caller gets. A value that used
// to duplicate a non-default sibling and now duplicates the shipped default has
// become the "ask for Glossary, receive Catalog" defect, and it would otherwise
// ship green.
function retargeted(before, after) {
  const was = collapseTargets(before);
  const now = collapseTargets(after);
  const out = [];
  now.forEach(function (target, key) {
    if (was.has(key) && was.get(key) !== target) {
      out.push(key + ": " + was.get(key) + " -> " + target);
    }
  });
  return out.sort();
}

// How much of a rise in the total is already accounted for, so the crude total
// bound never reds for something the per-value checks have allowed.
//
// Two sources, and they must not both pay for the same collapse: every key on a
// slug the baseline lacks (the new-component case), plus waived keys on slugs
// the baseline HAS. Counting a waived key on a new slug under both allowances
// let a genuine rise elsewhere through, one unit per waiver.
function allowedRise(before, after, exemptions) {
  const knownSlugs = new Set(Object.keys((before && before.slugs) || {}));
  const had = collapseKeys(before);
  let allowed = 0;
  collapseKeys(after).forEach(function (key) {
    if (!knownSlugs.has(slugOf(key))) return allowed++;
    if (!had.has(key) && isExplained(exemptions, key)) return allowed++;
  });
  return allowed;
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

// Exemption keys that name a real collapse but carry no usable reason.
//
// Reported apart from staleness because the two send a reader to opposite
// places. A stale entry has nothing left to excuse and should be deleted; a
// reasonless one has something to excuse and is missing the decision. Folding
// them together produced a failure that pointed at a staleness check which was
// green and named nothing.
function unusableExemptions(contract, exemptions) {
  const present = collapseKeys(contract);
  return Object.keys(exemptions || {})
    .filter(function (key) {
      return present.has(key) && !isExplained(exemptions, key);
    })
    .sort();
}

module.exports = {
  STATE_AXIS: STATE_AXIS,
  isStateAxis: isStateAxis,
  slugOf: slugOf,
  collapseKeys: collapseKeys,
  collapseTargets: collapseTargets,
  newCollapses: newCollapses,
  retargeted: retargeted,
  allowedRise: allowedRise,
  classify: classify,
  staleExemptions: staleExemptions,
  unusableExemptions: unusableExemptions,
};
