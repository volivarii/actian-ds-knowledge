"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const classify = require(
  path.join(__dirname, "helpers", "variant-collapse.js"),
);

// A contract slice in the shape derive-contract.js publishes, so these tests run
// against the real data shape rather than a convenience of their own.
function contractWith(slugs) {
  return { slugs: slugs };
}

test("a collapse that moves to a different value is new, even at an unchanged count", function () {
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

  // One collapse fixed, one introduced: the count is 1 before and 1 after, so a
  // count-keyed comparison reports nothing. The value that newly collapses is
  // the regression, and it must be named.
  assert.deepEqual(classify.newCollapses(before, after), [
    "button Emphasis=Ghost",
  ]);
});

test("a value collapsing onto the axis default is a clamp; onto a sibling, a twin", function () {
  const contract = contractWith({
    // Asking for Glossary type and receiving the axis default is a substitution:
    // the caller named a value and got a different component back.
    "card-for-items": {
      variants: {
        Type: {
          values: ["Catalog", "Item", "Glossary type"],
          rendersAs: { "Glossary type": "Catalog" },
        },
      },
    },
    // Two non-default values that render alike state a fact about the design,
    // not a substitution of the caller's request.
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

// The renderer documents decisions the contract cannot express. spinner's branch
// says its Complete axis "is the animation's own arc-fill cycle, not a chooseable
// variant (usage guideline), so it is ignored here". Counting that as a defect
// makes the reported number mean two different things at once.
const SPINNER_REASON =
  "the renderer documents Complete as the animation's arc-fill cycle, not a " +
  "chooseable variant";

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
    "spinner Complete=75%": SPINNER_REASON,
    "spinner Complete=100%": SPINNER_REASON,
  });

  assert.deepEqual(report.exempt, [
    "spinner Complete=100%",
    "spinner Complete=75%",
  ]);
  assert.deepEqual(report.unexplained, ["page-header Type=Details page"]);
});

test("an exemption that no longer names a real collapse is reported as stale", function () {
  const contract = contractWith({
    spinner: {
      variants: {
        Complete: { values: ["50%", "75%"], rendersAs: {} },
      },
    },
  });

  // Someone gave Complete=75% its own rendering. The exemption now excuses
  // nothing, and left in place it would silently cover a future regression on
  // the same key.
  assert.deepEqual(
    classify.staleExemptions(contract, {
      "spinner Complete=75%": SPINNER_REASON,
    }),
    ["spinner Complete=75%"],
  );
});

test("a collapse in a slug the baseline never had is a new fact, not a regression", function () {
  const before = contractWith({
    button: {
      variants: {
        Emphasis: { values: ["Filled", "Ghost"], rendersAs: {} },
      },
    },
  });
  // `action-bar` is absent from the baseline: either a component the sync just
  // added, or `sticky-footer` under its new name. Every one of its keys is
  // unseen, so a set comparison that did not skip it would red on a rename with
  // nothing to fix -- and the identity ledger (#553) exists precisely so a
  // rename lands additively.
  const after = contractWith({
    button: {
      variants: {
        Emphasis: { values: ["Filled", "Ghost"], rendersAs: {} },
      },
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

  assert.deepEqual(classify.newCollapses(before, after), []);
});

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

  assert.deepEqual(classify.newCollapses(before, after), [
    "toolbar Type=Group",
  ]);
  // The escape hatch is per VALUE, not per slug: a reason attached to the exact
  // value it excuses cannot also cover a different regression in the same
  // component later.
  assert.deepEqual(
    classify.newCollapses(before, after, {
      "toolbar Type=Group": "the redesign folded Group into Single",
    }),
    [],
  );
  assert.deepEqual(
    classify.newCollapses(before, after, { "toolbar Type=Group": "" }),
    ["toolbar Type=Group"],
  );
});

test("an exemption with no reason excuses nothing", function () {
  const contract = contractWith({
    spinner: {
      variants: {
        Complete: { values: ["50%", "75%"], rendersAs: { "75%": "50%" } },
      },
    },
  });

  // Same shape as the coverage gate's --accept-coverage-loss="<why>": the flag
  // without a reason accepts nothing. A bare key would let a collapse be waved
  // through by an edit that records no decision.
  const report = classify.classify(contract, { "spinner Complete=75%": "" });
  assert.deepEqual(report.exempt, []);
  assert.deepEqual(report.unexplained, ["spinner Complete=75%"]);
});
