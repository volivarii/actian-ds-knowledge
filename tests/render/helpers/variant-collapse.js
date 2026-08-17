"use strict";

// Which variant values the renderer cannot tell apart.
//
// The ratchet this serves used to compare counts per slug. A count cannot see a
// swap: fix one collapsed value and introduce another in the same slug and the
// number is unchanged, so the regression ships green.
//
// 🪤 The obvious repair, comparing `rendersAs` pairs, is also wrong, and two
// review rounds were needed to see why. `rendersAs` records, for each duplicated
// value, the FIRST value of its group in `values` order (derive-contract.js).
// That anchor is an artifact of iteration order, so anything keyed on it moves
// for reasons that are not regressions:
//
//   * Fixing the anchor re-anchors the rest. Give `calendar Type=Single date
//     select` its own rendering and the remaining group re-anchors on `Date`, so
//     an anchor-keyed check reds on 3 collapses becoming 2. That is a gate
//     blocking the exact improvement it exists to encourage.
//   * Reordering an axis in Figma rewrites every anchor in it. transform-registry
//     copies `variantOptions` verbatim, so a designer reordering variants is an
//     ordinary nightly-sync event with no renderer change at all.
//
// So the comparison here is on EQUIVALENCE CLASSES: which values render
// identically to which. That is invariant under both re-anchoring and
// reordering, and it still catches the thing that matters, a value starting to
// duplicate something it did not duplicate before.

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
//
// 🪤 A slug containing a space would silently break this: the prefix would not
// match a known slug and every collapse in that component would be SKIPPED, a
// false all-clear rather than a red. The ratchet asserts the invariant rather
// than trusting it.
function slugOf(key) {
  return key.slice(0, key.indexOf(" "));
}

function eachAxis(contract, visit) {
  const slugs = (contract && contract.slugs) || {};
  Object.keys(slugs).forEach(function (slug) {
    const variants = slugs[slug].variants || {};
    Object.keys(variants).forEach(function (axis) {
      if (isStateAxis(axis)) return;
      visit(
        slug,
        axis,
        variants[axis].values || [],
        variants[axis].rendersAs || {},
      );
    });
  });
}

function eachCollapse(contract, visit) {
  eachAxis(contract, function (slug, axis, values, rendersAs) {
    Object.keys(rendersAs).forEach(function (value) {
      visit(keyFor(slug, axis, value), rendersAs[value], values);
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

// key -> the sorted list of OTHER values in the same axis that render
// identically to it. Empty for a value the renderer draws distinctly.
//
// Built from the anchor, because that is what the contract publishes, but the
// anchor never leaves this function: two values are in the same class when they
// share an anchor, or when one IS the other's anchor.
function identicalSets(contract) {
  const out = new Map();
  eachAxis(contract, function (slug, axis, values, rendersAs) {
    const groups = new Map();
    values.forEach(function (value) {
      const anchor = Object.prototype.hasOwnProperty.call(rendersAs, value)
        ? rendersAs[value]
        : value;
      if (!groups.has(anchor)) groups.set(anchor, []);
      groups.get(anchor).push(value);
    });
    groups.forEach(function (members) {
      members.forEach(function (value) {
        out.set(
          keyFor(slug, axis, value),
          members
            .filter(function (m) {
              return m !== value;
            })
            .sort(),
        );
      });
    });
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
// back" to anything. This split is REPORTING only; nothing gates on it, exactly
// because a Figma reorder can move it. What holds either way is the part that
// matters: the caller named a value and received the markup of a different one.
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

// Values that now render identically to something they did not render
// identically to at the baseline.
//
// This is the whole gate. It fires on a value that newly collapses at all, and
// on one that still collapses but has started duplicating a DIFFERENT sibling
// (the "ask for Glossary type, receive Catalog" defect, #550). It stays silent
// when a class merely shrinks, which is what a fix looks like, and when the
// anchor moves under it.
//
// Slugs the baseline does not carry are skipped, as the count-keyed comparison
// did implicitly by requiring the slug on both sides. Two real cases need it: a
// component the Figma sync just added, whose collapse is a new fact rather than
// a regression, and a component that arrived under a new NAME, where nothing is
// recognisable and a comparison would otherwise red a rename that has nothing to
// fix.
//
// 🪤 An axis or a value RENAME inside a known slug is not skipped and will be
// reported, because the old key disappears and a new one takes its place. Figma
// auto-names values, and `Percent3` and `Property 1` in this very data are what
// that looks like. The honest remedy is a BY_DESIGN entry whose reason says the
// value was renamed and names the key it replaces.
// Reported once per unordered PAIR. "A renders as B" and "B renders as A" are
// one fact, and emitting both doubled every failure.
//
// A pair is waived when EITHER of its values carries a reason, because a
// by-design entry names the value whose behaviour is deliberate and cannot know
// which sibling the contract will anchor it against. That is what lets
// `spinner Complete` be waived by naming the three non-anchor values rather than
// all six pairs among four values.
function newlyIdentical(before, after, exemptions) {
  const was = identicalSets(before);
  const now = identicalSets(after);
  const knownSlugs = new Set(Object.keys((before && before.slugs) || {}));
  const seen = new Set();
  const out = [];
  now.forEach(function (siblings, key) {
    if (!knownSlugs.has(slugOf(key))) return;
    const had = was.get(key) || [];
    const slug = slugOf(key);
    const axis = key.slice(slug.length + 1, key.lastIndexOf("="));
    const value = key.slice(key.lastIndexOf("=") + 1);
    siblings.forEach(function (sibling) {
      if (had.indexOf(sibling) !== -1) return;
      const pair = [value, sibling].sort();
      const id = slug + " " + axis + ": " + pair[0] + " | " + pair[1];
      if (seen.has(id)) return;
      seen.add(id);
      if (
        isExplained(exemptions, key) ||
        isExplained(exemptions, keyFor(slug, axis, sibling))
      ) {
        return;
      }
      out.push(
        slug +
          " " +
          axis +
          ": " +
          pair[0] +
          " and " +
          pair[1] +
          " now render identically",
      );
    });
  });
  return out.sort();
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

// Slugs and axes whose names would break the key format, i.e. a slug containing
// a space (which makes slugOf return a prefix and silently skip the component)
// or an axis containing "=" (which makes keyFor non-injective, so two different
// values share one key and one of them stops being watched). Both failures are
// silent passes, so the ratchet asserts against them rather than assuming.
function malformedNames(contract) {
  const out = [];
  const slugs = (contract && contract.slugs) || {};
  Object.keys(slugs).forEach(function (slug) {
    if (/\s/.test(slug)) out.push("slug contains whitespace: " + slug);
    Object.keys(slugs[slug].variants || {}).forEach(function (axis) {
      if (axis.indexOf("=") !== -1) {
        out.push("axis contains '=': " + slug + " " + axis);
      }
    });
  });
  return out.sort();
}

module.exports = {
  STATE_AXIS: STATE_AXIS,
  isStateAxis: isStateAxis,
  slugOf: slugOf,
  collapseKeys: collapseKeys,
  identicalSets: identicalSets,
  newlyIdentical: newlyIdentical,
  classify: classify,
  staleExemptions: staleExemptions,
  unusableExemptions: unusableExemptions,
  malformedNames: malformedNames,
};
