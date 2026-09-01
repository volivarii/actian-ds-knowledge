"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const classify = require(
  path.join(__dirname, "..", "..", "scripts", "render", "lib", "variant-collapse.js"),
);

// A contract slice in the shape derive-contract.js publishes, so these tests run
// against the real data shape rather than a convenience of their own.
function contractWith(slugs) {
  return { slugs: slugs };
}

// --- what must be reported ---------------------------------------------------

test("a value that newly collapses at all is reported", function () {
  const before = contractWith({
    toolbar: {
      variants: {
        Orientation: { values: ["Horizontal", "Vertical"], rendersAs: {} },
      },
    },
  });
  const after = contractWith({
    toolbar: {
      variants: {
        Orientation: {
          values: ["Horizontal", "Vertical"],
          rendersAs: { Vertical: "Horizontal" },
        },
      },
    },
  });

  assert.deepEqual(classify.newlyIdentical(before, after), [
    "toolbar Orientation: Horizontal and Vertical now render identically",
  ]);
});

test("a value that starts duplicating a value it did not duplicate is reported", function () {
  const before = contractWith({
    card: {
      variants: {
        Type: {
          values: ["Catalog", "Item", "Glossary type"],
          rendersAs: { "Glossary type": "Item" },
        },
      },
    },
  });
  const after = contractWith({
    card: {
      variants: {
        Type: {
          values: ["Catalog", "Item", "Glossary type"],
          rendersAs: { "Glossary type": "Catalog" },
        },
      },
    },
  });

  // Ask for Glossary type, and where you used to receive Item you now receive
  // Catalog. The collapse COUNT never moved, and neither did the set of
  // collapsed values, so only a comparison of what-duplicates-what sees it.
  assert.deepEqual(classify.newlyIdentical(before, after), [
    "card Type: Catalog and Glossary type now render identically",
  ]);
});

test("a swap inside one component is reported, at an unchanged count", function () {
  const before = contractWith({
    button: {
      variants: {
        Emphasis: {
          values: ["Filled", "Outlined", "Ghost"],
          rendersAs: { Outlined: "Filled" },
        },
      },
    },
  });
  const after = contractWith({
    button: {
      variants: {
        Emphasis: {
          values: ["Filled", "Outlined", "Ghost"],
          rendersAs: { Ghost: "Filled" },
        },
      },
    },
  });

  // One collapse fixed, one introduced: the count is 1 on both sides, so the
  // count-keyed comparison this replaced reported nothing.
  assert.deepEqual(classify.newlyIdentical(before, after), [
    "button Emphasis: Filled and Ghost now render identically",
  ]);
});

// --- what must NOT be reported -----------------------------------------------
//
// `rendersAs` names, for each duplicated value, the FIRST value of its group in
// `values` order. That anchor is an artifact of iteration order, so a check
// keyed on it fires on things that are not regressions. These two are why the
// comparison is on equivalence classes instead.

test("giving the anchor value its own rendering is an improvement, not a regression", function () {
  const before = contractWith({
    calendar: {
      variants: {
        Type: {
          values: ["Single date select", "Date", "Month", "Single"],
          rendersAs: {
            Date: "Single date select",
            Month: "Single date select",
            Single: "Single date select",
          },
        },
      },
    },
  });
  // Someone implements "Single date select". Three collapses become two, and the
  // remaining group re-anchors on Date purely because it is now first. Nothing
  // got worse for any caller, and a gate that reds here blocks the exact work it
  // exists to encourage.
  const after = contractWith({
    calendar: {
      variants: {
        Type: {
          values: ["Single date select", "Date", "Month", "Single"],
          rendersAs: { Month: "Date", Single: "Date" },
        },
      },
    },
  });

  assert.deepEqual(classify.newlyIdentical(before, after), []);
});

test("reordering an axis's values on its own reports nothing", function () {
  // transform-registry.js copies Figma's variantOptions verbatim, so a designer
  // reordering variants is an ordinary nightly-sync event with no renderer
  // change and nothing visible to any caller, even though every anchor moves.
  const before = contractWith({
    tag: {
      variants: {
        Kind: { values: ["A", "B", "C"], rendersAs: { B: "A", C: "A" } },
      },
    },
  });
  const after = contractWith({
    tag: {
      variants: {
        Kind: { values: ["B", "A", "C"], rendersAs: { A: "B", C: "B" } },
      },
    },
  });

  assert.deepEqual(classify.newlyIdentical(before, after), []);
});

test("a collapse in a slug the baseline never had is a new fact, not a regression", function () {
  const before = contractWith({
    button: {
      variants: { Emphasis: { values: ["Filled", "Ghost"], rendersAs: {} } },
    },
  });
  // `action-bar` is absent from the baseline: either a component the sync just
  // added, or `sticky-footer` under its new name. Nothing in it is recognisable,
  // so a comparison that did not skip it would red a rename with nothing to fix.
  const after = contractWith({
    button: {
      variants: { Emphasis: { values: ["Filled", "Ghost"], rendersAs: {} } },
    },
    "action-bar": {
      variants: {
        Type: {
          values: ["Default", "Compact"],
          rendersAs: { Compact: "Default" },
        },
      },
    },
  });

  assert.deepEqual(classify.newlyIdentical(before, after), []);
});

// --- the escape hatch --------------------------------------------------------

test("a new collapse can be waived, but only by naming that value with a reason", function () {
  const before = contractWith({
    toolbar: {
      variants: { Type: { values: ["Single", "Group"], rendersAs: {} } },
    },
  });
  const after = contractWith({
    toolbar: {
      variants: {
        Type: { values: ["Single", "Group"], rendersAs: { Group: "Single" } },
      },
    },
  });

  assert.equal(classify.newlyIdentical(before, after).length, 1);
  // Per VALUE, not per slug: a reason attached to the exact value it excuses
  // cannot also cover a different regression in the same component later.
  assert.deepEqual(
    classify.newlyIdentical(before, after, {
      "toolbar Type=Group": "the redesign folded Group into Single",
    }),
    [],
  );
  // Same rule as the coverage gate's --accept-coverage-loss="<why>": the flag
  // without a reason accepts nothing.
  assert.equal(
    classify.newlyIdentical(before, after, { "toolbar Type=Group": "" }).length,
    1,
  );
});

test("an exemption that no longer names a real collapse is reported as stale", function () {
  const contract = contractWith({
    spinner: {
      variants: { Complete: { values: ["50%", "75%"], rendersAs: {} } },
    },
  });

  // Someone gave Complete=75% its own rendering. The exemption now excuses
  // nothing, and left in place it would silently cover a future regression on
  // the same key.
  assert.deepEqual(
    classify.staleExemptions(contract, { "spinner Complete=75%": "a reason" }),
    ["spinner Complete=75%"],
  );
});

test("an exemption stays valid when its group re-anchors onto it", function () {
  // The anchor moves for reasons that are not regressions, which is the whole
  // premise of this file. An exemption validated against `rendersAs` keys is
  // valid only while its value is NOT the anchor, so implementing the anchor,
  // or a Figma reorder, would tell the author to delete a decision record that
  // is still true. Membership of a duplicate group is the anchor-free test.
  const after = contractWith({
    spinner: {
      variants: {
        Complete: {
          values: ["50%", "75%", "100%", "25%"],
          // Someone implemented 50%, so the remaining group re-anchors on 75%.
          rendersAs: { "100%": "75%", "25%": "75%" },
        },
      },
    },
  });

  assert.deepEqual(
    classify.staleExemptions(after, { "spinner Complete=75%": "a keyframe" }),
    [],
  );
  // Once 75% renders distinctly it really is stale, and must still be caught.
  const fixed = contractWith({
    spinner: {
      variants: {
        Complete: {
          values: ["50%", "75%", "100%", "25%"],
          rendersAs: { "25%": "100%" },
        },
      },
    },
  });
  assert.deepEqual(
    classify.staleExemptions(fixed, { "spinner Complete=75%": "a keyframe" }),
    ["spinner Complete=75%"],
  );
});

test("a value containing an equals sign is reported once and can be waived", function () {
  const before = contractWith({
    s: { variants: { A: { values: ["x=1", "y"], rendersAs: {} } } },
  });
  const after = contractWith({
    s: { variants: { A: { values: ["x=1", "y"], rendersAs: { y: "x=1" } } } },
  });

  // One fact, so one line. Splitting the key at the LAST "=" instead of the
  // first disagreed with how keyFor builds it, so the two directions of the
  // same pair parsed differently, dodged the dedupe, and a correct waiver
  // suppressed only half of it.
  assert.deepEqual(classify.newlyIdentical(before, after), [
    "s A: x=1 and y now render identically",
  ]);
  assert.deepEqual(
    classify.newlyIdentical(before, after, { "s A=y": "why" }),
    [],
  );
});

test("a baseline sharing no slugs with the fresh contract is not comparable", function () {
  // newlyIdentical skips every slug the baseline lacks, so when the two sides
  // share no slugs it returns the same empty array a clean run returns. Both
  // sides having collapses does not make them comparable, which is what the
  // guard used to check.
  const before = contractWith({
    "old-name": {
      variants: { T: { values: ["a", "b"], rendersAs: { b: "a" } } },
    },
  });
  const after = contractWith({
    "new-name": {
      variants: {
        T: { values: ["a", "b", "c"], rendersAs: { b: "a", c: "a" } },
      },
    },
  });

  assert.equal(classify.sharedSlugs(before, after), 0);
  assert.equal(classify.sharedSlugs(before, before), 1);
});

test("a value new to an axis is a new fact, not a regression", function () {
  // Figma auto-names variant values, and `Percent3` and `Property 1` in the
  // shipped data are what that looks like. A value RENAME is indistinguishable
  // from a new value, and reporting it puts a red on an ordinary sync PR whose
  // only remedy is hand-editing the decision record. Same reasoning as skipping
  // a slug the baseline lacks.
  const before = contractWith({
    loader: {
      variants: {
        Percent: {
          values: ["Property 1", "10%", "Percent3"],
          rendersAs: { "10%": "Property 1", Percent3: "Property 1" },
        },
      },
    },
  });
  const after = contractWith({
    loader: {
      variants: {
        Percent: {
          values: ["Property 1", "10%", "Percent4"],
          rendersAs: { "10%": "Property 1", Percent4: "Property 1" },
        },
      },
    },
  });

  assert.deepEqual(classify.newlyIdentical(before, after), []);
});

test("the explained split does not move when an axis is reordered", function () {
  const values = ["50%", "75%", "100%", "25%"];
  const before = contractWith({
    spinner: {
      variants: {
        Complete: {
          values: values,
          rendersAs: { "75%": "50%", "100%": "50%", "25%": "50%" },
        },
      },
    },
  });
  // The same flat axis, reordered so the exempted 25% becomes the anchor. The
  // record still covers the same group, so the counts must not move.
  const after = contractWith({
    spinner: {
      variants: {
        Complete: {
          values: ["25%", "50%", "75%", "100%"],
          rendersAs: { "50%": "25%", "75%": "25%", "100%": "25%" },
        },
      },
    },
  });
  const reasons = {
    "spinner Complete=25%": "keyframe",
    "spinner Complete=75%": "keyframe",
    "spinner Complete=100%": "keyframe",
  };

  assert.deepEqual(classify.classify(before, reasons).unexplained, []);
  assert.deepEqual(classify.classify(after, reasons).unexplained, []);
  assert.equal(
    classify.classify(before, reasons).exempt.length,
    classify.classify(after, reasons).exempt.length,
  );
});

test("keyFor is exported, so callers cannot re-implement the key format", function () {
  assert.equal(
    classify.keyFor("side-nav", "Built type", "By rows"),
    "side-nav Built type=By rows",
  );
});

test("an empty contract yields no collapses, so a vacuity guard can fire", function () {
  // The ratchet asserts the baseline produced something to compare, because
  // newlyIdentical returns [] for an unrecognisable baseline exactly as it does
  // for a clean one. That guard is only worth anything if this is true.
  assert.equal(classify.collapseKeys({ slugs: {} }).size, 0);
  assert.equal(classify.collapseKeys({}).size, 0);
});

test("an exemption whose reason is blank is reported as unusable", function () {
  const contract = contractWith({
    spinner: {
      variants: {
        Complete: { values: ["50%", "75%"], rendersAs: { "75%": "50%" } },
      },
    },
  });

  // It names a real collapse, so the staleness check passes it, but it excuses
  // nothing. Reported separately so the failure sends a reader to the entry
  // rather than to a staleness test that is green and names nothing.
  assert.deepEqual(
    classify.unusableExemptions(contract, { "spinner Complete=75%": "  " }),
    ["spinner Complete=75%"],
  );
  assert.deepEqual(
    classify.unusableExemptions(contract, { "spinner Complete=75%": "why" }),
    [],
  );
});

// --- reporting ---------------------------------------------------------------

test("a value collapsing onto the first-listed value is a clamp; onto another sibling, a twin", function () {
  const contract = contractWith({
    // First-listed is a proxy for the default, not a record of it; see the
    // helper's note on why the registry stores no default. Reporting only.
    "card-for-items": {
      variants: {
        Type: {
          values: ["Catalog", "Item", "Glossary type"],
          rendersAs: { "Glossary type": "Catalog" },
        },
      },
    },
    toolbar: {
      variants: {
        Type: {
          values: ["Single", "Combined", "Group"],
          rendersAs: { Group: "Combined" },
        },
      },
    },
  });

  const report = classify.classify(contract);
  assert.deepEqual(report.clamps, ["card-for-items Type=Glossary type"]);
  assert.deepEqual(report.twins, ["toolbar Type=Group"]);
});

test("an explained collapse is exempt, and only the rest is unexplained", function () {
  const contract = contractWith({
    spinner: {
      variants: {
        Complete: {
          values: ["50%", "75%", "100%"],
          rendersAs: { "75%": "50%", "100%": "50%" },
        },
      },
    },
    "page-header": {
      variants: {
        Type: {
          values: ["Default", "Details page"],
          rendersAs: { "Details page": "Default" },
        },
      },
    },
  });

  const report = classify.classify(contract, {
    "spinner Complete=75%": "an animation keyframe",
    "spinner Complete=100%": "an animation keyframe",
  });

  assert.deepEqual(report.exempt, [
    "spinner Complete=100%",
    "spinner Complete=75%",
  ]);
  assert.deepEqual(report.unexplained, ["page-header Type=Details page"]);
});

// --- the key format's own invariants -----------------------------------------

test("the state-axis predicate matches only whole State axis names", function () {
  // It suppresses 47 of the 104 collapses in the shipped contract, so an
  // over-matching regression would empty the gated set and turn every check
  // green. Nothing else asserted it.
  assert.equal(classify.isStateAxis("State"), true);
  assert.equal(classify.isStateAxis("States"), true);
  assert.equal(classify.isStateAxis("state"), true);
  assert.equal(classify.isStateAxis("Toggle position"), false);
  assert.equal(classify.isStateAxis("Type"), false);
  // Non-letters are stripped before matching, which is what lets the kit's
  // stray-apostrophe axis names through, so this must not become a substring
  // match on the way past.
  assert.equal(classify.isStateAxis("State'"), true);
  assert.equal(classify.isStateAxis("Built type"), false);
  assert.equal(classify.isStateAxis("Estates"), false);
});

test("names that would break the key format are reported", function () {
  // Both failures below are SILENT PASSES rather than reds, which is why they
  // are asserted rather than assumed: a slug with a space makes slugOf return a
  // prefix, so the component is skipped entirely, and an axis containing "="
  // makes two different values share one key.
  const contract = contractWith({
    "bad slug": { variants: { Type: { values: ["a", "b"], rendersAs: {} } } },
    good: { variants: { "we=ird": { values: ["a", "b"], rendersAs: {} } } },
  });

  assert.deepEqual(classify.malformedNames(contract), [
    "axis contains '=': good we=ird",
    "slug contains whitespace: bad slug",
  ]);
  assert.deepEqual(
    classify.malformedNames(
      contractWith({
        fine: { variants: { "Size & Type": { values: ["a"], rendersAs: {} } } },
      }),
    ),
    [],
  );
});
