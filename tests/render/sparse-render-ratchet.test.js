"use strict";

// THE SPARSE RENDER RATCHET.
//
// The property, stated directly: a component must not invent content the caller
// did not ask for. Two measurements, because one of them alone was believed to
// cover more than it does:
//
//   1. every slug rendered with NO props, counting the elements that carry
//      visible text. That count may fall, it may not rise. What it catches is a
//      fallback that adds a NEW text-bearing element.
//   2. every (slug, prop) pair rendered twice, empty and with a sentinel, to ask
//      whether supplying the prop REMOVED anything. A prop may add to the
//      markup; if it takes something away, the renderer had content of its own
//      there. That set may shrink, it may not grow.
//
// The second exists because the first is blind to a fallback injected into an
// element that ALREADY carries text (elements are counted once), to one carried
// by an attribute, and to one inside an svg. A review demonstrated the first of
// those with a real exploit: moving chat-with-ai-steward's Source fallback into
// the existing "New chat" button changed the rendered text and moved the count
// by zero. Measurement 2 names that pair. What neither one reaches is stated
// below, in its own section, because the round that added measurement 2 claimed
// the pair closed everything and it does not.
//
// It exists because the guard next to it cannot see far enough. #543 gave the
// renderer a literal fallback for thirteen optional slots, which removed the
// ability to render those components WITHOUT the part. #544 moved twelve of the
// strings into matrix.js SPECIMEN_PROPS and added
// tests/render/optional-slot-omission.test.js, which ITERATES that map. The
// thirteenth (chat-with-ai-steward's context chip, written as a variable
// initialised to the literal rather than as `props.X ? el : ""`) was never in
// the map, so the omission test walked past it and stayed green while the chip
// shipped into every steward render downstream.
//
// A guard keyed on a list checks the things somebody remembered to list. Neither
// measurement here keeps a list of SLOTS: the subjects come from the render
// contract and the ANSWER is read off the rendered markup, so within their scope
// the source can be written any way at all.
//
// THAT SCOPE, exactly, because the round before this one overclaimed it. Both
// measurements render ONE cell per slug, with no variant and no props, and the
// pair check examines only contract-listed props whose value actually reaches
// the markup. So three real invented-content defects can land with both numbers
// unmoved:
//
//   - a fallback reachable only under another variant or State (a literal in the
//     steward's Welcome branch, in collapse-accordion's expanded state)
//   - a prop the contract's regex cannot see, e.g. `props["Sc" + "ope"]`
//   - a listed prop whose value never reaches the markup, so the sentinel never
//     appears and the pair is skipped
//
// The artifact publishes two of those three gaps as ratios, measured on every
// run rather than described in a comment that ages: `totals.pairsProbed` against
// `totals.pairsInContract` for the props that never echo, and
// `totals.cellsRendered` against `totals.matrixCells` for the unrendered
// variants. The third cannot have a number: a prop the contract cannot see is
// missing from both sides of any count derived from the contract, so
// `props["Sc" + "ope"]` is named here and nowhere counted. Closing the first two
// is a coverage extension, tracked as follow-up work.
//
// What measure 2 DOES close is measure 1's three blind spots, and only those:
// injection into an element that already carries text, an attribute-borne
// fallback, and svg title text.
//
// Neither number is a target. Most of both sets is legitimate: structural
// chrome in one, designed fallbacks in the other. Only the direction is gated.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const mergeBase = require("./helpers/merge-base.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const D = require(
  path.join(REPO_ROOT, "scripts", "render", "derive-sparse-render.js"),
);
// Measured NOW from the renderer in the working tree, never read from the
// committed dist: on a branch that has not yet run its own derive the dist is
// stale by construction, and on a branch that has, comparing dist to dist is
// new-against-new and always passes.
const fresh = D.measureSparse();

// Escape hatch, the same intent as the fidelity gate's
// --accept-coverage-loss="<why>": a rise is allowed only by naming it with a
// reason, so a decision to ship a new unconditional part reads like a decision
// in the diff. A rise can be legitimate (a component can genuinely gain a part
// by design). It may not be silent.
//
// A waiver names the EXACT rise it was written for, `from` and `to`, and waives
// only that one. The first version keyed on the slug alone and read nothing but
// the key, so `{"page-header": ""}` waived silently, and a waiver written for
// 1 -> 2 went on covering 2 -> 9 for as long as it sat here. Both are the
// silent-pass shape this file exists to remove, reintroduced by its own escape
// hatch.
const ACCEPTED_RISE = {
  // "some-slug": { from: 1, to: 2, reason: "why this part is now unconditional" },
};

// The same hatch for the invented-content set, keyed by "slug.prop". Membership
// is binary, so there is no from/to to pin: naming the pair IS naming the exact
// change, and the reason is mandatory in the same way.
const ACCEPTED_INVENTED = {
  // "some-slug.SomeProp": "why this prop has a designed fallback now",

  // Not new invention. These are sticky-footer.Primary/.Secondary under the
  // slug Figma renamed the component to in the 2026-08-24 breaking sync (#526).
  // The renderer's `props.Primary || "Save"` fallback is unchanged and predates
  // the ratchet; the baseline is read at the merge base, which still says
  // sticky-footer, so a rename reads as two brand-new invented slots. The
  // fidelity gate's per-slug check could not see the same rename either.
  //
  // These entries are deliberately NOT permanent cover: whether an action bar
  // should invent "Save" and "Cancel" at all, or supply them from
  // matrix.js SPECIMEN_PROPS so a real product screen renders without them, is
  // the specimen-vs-runtime question #543 to #545 answered for 13 other slots
  // and never asked for this one. Filed separately; remove these two lines when
  // it is answered.
  "action-bar.Primary":
    "rename of sticky-footer.Primary (#526); pre-existing fallback, see note above",
  "action-bar.Secondary":
    "rename of sticky-footer.Secondary (#526); pre-existing fallback, see note above",

  // Same shape, one reorg later. Figma v2.7.0 renamed input-date to date-input
  // and metamodel-widget to metamodel (#589). The baseline is read at the merge
  // base, which still lists these three slots under the old slugs, so the
  // rename alone reads as three brand-new invented slots. Verified, not
  // assumed: inventedSlots holds input-date.Label, input-date.Placeholder text
  // and metamodel-widget.Item type initials at the merge base, and the total is
  // unchanged at 95. The renderer's fallbacks are untouched.
  //
  // Not permanent cover either: these are the same specimen-vs-runtime question
  // (#543 to #545) as the two above. Remove all five together when it is answered.
  "date-input.Label":
    "rename of input-date.Label (#589); pre-existing fallback, see note above",
  "date-input.Placeholder text":
    "rename of input-date.Placeholder text (#589); pre-existing fallback, see note above",
  "metamodel.Item type initials":
    "rename of metamodel-widget.Item type initials (#589); pre-existing fallback, see note above",
};

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function reasonOf(entry) {
  const reason = entry && typeof entry === "object" ? entry.reason : entry;
  return typeof reason === "string" ? reason.trim() : "";
}

// A waiver applies only when it carries a reason AND describes the rise in front
// of it. Anything else is not a waiver, so the rise it was meant to cover fails
// loudly and names itself.
function waives(accepted, slug, from, to) {
  const entry = accepted[slug];
  if (!entry || !reasonOf(entry)) return false;
  return entry.from === from && entry.to === to;
}

// Pure, and their own subject in the tests below: the comparison is the part
// that has to be able to go red, and proving that on the real corpus would mean
// breaking the renderer to watch it work.
function risesAgainst(before, after, accepted) {
  return Object.keys(after)
    .filter(function (slug) {
      return (
        hasOwn(before, slug) &&
        after[slug] > before[slug] &&
        !waives(accepted, slug, before[slug], after[slug])
      );
    })
    .sort()
    .map(function (slug) {
      return slug + ": " + before[slug] + " -> " + after[slug];
    });
}

// Waivers that are not usable as written: no reason, a blank one, or a malformed
// from/to. Reported by name rather than ignored, because an unusable waiver in
// the map reads to a later author as cover that exists.
function malformedWaivers(accepted) {
  return Object.keys(accepted)
    .filter(function (slug) {
      const entry = accepted[slug];
      if (!reasonOf(entry)) return true;
      return !(
        Number.isInteger(entry.from) &&
        Number.isInteger(entry.to) &&
        entry.to > entry.from
      );
    })
    .sort();
}

function malformedInventedWaivers(accepted) {
  return Object.keys(accepted)
    .filter(function (key) {
      return !reasonOf(accepted[key]);
    })
    .sort();
}

// New members of the invented-content set, minus the ones waived with a reason.
function newlyInvented(before, after, accepted) {
  const had = new Set(before);
  return after
    .filter(function (pair) {
      return !had.has(pair) && !reasonOf(accepted[pair]);
    })
    .sort();
}

// Headroom for the total, so it never reds for something the per-slug check has
// already allowed. Only waived rises need it now: slugs absent from the baseline
// are excluded from the total outright (see comparableTotals), which is tighter
// than giving them headroom.
function headroomFor(before, after, accepted) {
  return Object.keys(after).reduce(function (a, slug) {
    if (!hasOwn(before, slug)) return a;
    if (waives(accepted, slug, before[slug], after[slug])) {
      return a + (after[slug] - before[slug]);
    }
    return a;
  }, 0);
}

// The total, over the components present at BOTH points and nothing else.
// Summing all of `before` let a retired slug's count pay for a rise somewhere
// else, and summing all of `after` made a newly added component look like one.
// Same population on both sides, so the direction means what it says.
function comparableTotals(before, after) {
  const common = Object.keys(after).filter(function (slug) {
    return hasOwn(before, slug);
  });
  return {
    common: common,
    from: common.reduce(function (a, s) {
      return a + before[s];
    }, 0),
    to: common.reduce(function (a, s) {
      return a + after[s];
    }, 0),
  };
}

// DIRECTION, stated in the total's own terms and carried by BOTH messages. The
// blocking condition is compound (a per-slug rise OR a rise in the repo-wide
// total), so a report that mentions only one of them misstates the other: the
// fidelity gate announced a 60% coverage GAIN as a regression exactly once, and
// a reader who is told the wrong direction stops believing the gate. The
// per-slug list is the subject; this is the headline next to it, and it never
// says "regressed" about a fall.
function totalDirection(before, after) {
  const t = comparableTotals(before, after);
  const word = t.to > t.from ? "ROSE" : t.to < t.from ? "FELL" : "UNCHANGED";
  return (
    "Across the " +
    t.common.length +
    " components present at both points, sparse text-bearing elements " +
    word +
    ": " +
    t.from +
    " -> " +
    t.to +
    "."
  );
}

function inventedDirection(before, after) {
  const word =
    after.length > before.length
      ? "GREW"
      : after.length < before.length
        ? "SHRANK"
        : "UNCHANGED";
  return (
    "The set of (slug, prop) pairs that displace invented content " +
    word +
    ": " +
    before.length +
    " -> " +
    after.length +
    "."
  );
}

// The two blocking messages, built where they can be read back and asserted on
// rather than inlined into the assertion call. fidelity-check.js exports its
// coverageFailureMessage for the same reason: the wording IS part of the gate,
// and the wording is what decides whether the next reader fixes the defect or
// launders it.
function perSlugMessage(worse, before, after) {
  return (
    "these components render MORE visible text with no props supplied than they " +
    "did at the merge base, so a caller who asks for none of their optional " +
    "parts now gets parts it never asked for: " +
    JSON.stringify(worse) +
    ". The count is text-bearing elements, before -> after, and this BLOCKS " +
    "whichever way the repo-wide total moved. " +
    totalDirection(before, after) +
    " Specimen content belongs in matrix.js SPECIMEN_PROPS, where the gallery " +
    "gets it and the caller keeps the choice, not in a literal fallback in " +
    "ds-html-map.js. If the component really did gain a part by design, name " +
    "the slug in ACCEPTED_RISE with the exact rise and a reason."
  );
}

function totalMessage(headroom, before, after) {
  return (
    "the render tier as a whole invents more than it did at the merge base. " +
    totalDirection(before, after) +
    " " +
    headroom +
    " of the rise is already waived in ACCEPTED_RISE. Each of these elements " +
    "is a part a caller cannot switch off. Move the content to matrix.js " +
    "SPECIMEN_PROPS, or name the slug in ACCEPTED_RISE with the exact rise " +
    "and a reason."
  );
}

// The complement's message. Its subject is a (slug, prop) pair rather than a
// slug, and its remedy is the same one: the content belongs to the gallery, not
// to the renderer's runtime.
function inventedMessage(added, before, after) {
  return (
    "these props no longer add content, they REPLACE content the renderer " +
    "invented for them, so a caller cannot render the component without it: " +
    JSON.stringify(added) +
    ". " +
    inventedDirection(before, after) +
    " This catches what the sparse count cannot: a fallback injected into an " +
    "element that already carries text, one carried by an attribute, one " +
    "inside an svg. Move the content to matrix.js SPECIMEN_PROPS, or name the " +
    "pair in ACCEPTED_INVENTED with a reason."
  );
}

// The baseline is the artifact as it stood at the MERGE BASE, resolved by
// helpers/merge-base.js (shared with variant-collapse-ratchet).
//
// THE ONE FALLBACK, and why it is gated rather than merely rare. On the commit
// that INTRODUCES this artifact the merge base cannot carry it, so there is
// nothing to compare against and the committed copy is read instead. Left
// ungated, that path is reachable forever: render-derive.yml checks out
// `head.repo.full_name`, so on a fork PR `origin` is the FORK, and a
// contributor whose fork is behind gets a merge base older than the artifact,
// falls into the fallback, and compares a fresh derive against its own output.
// A vacuous green with one buried note is exactly what this file exists to stop.
//
// So the fallback applies only when this branch's own history ADDS the file,
// which is true of the introducing commit and of nothing else. Every other way
// of arriving without a baseline fails loudly, which is where
// variant-collapse-ratchet already stands.
function baselineArtifact() {
  const at = mergeBase.jsonAtMergeBase(D.OUT_REL);
  if (at.json) {
    // A baseline with no entries is worse than no baseline: every slug reads as
    // absent from it, absence is excluded from the comparison, and the whole
    // thing passes having compared nothing. It fails here instead.
    assert.ok(
      Object.keys(at.json.bySlug || {}).length > 0,
      "sparse-render-ratchet: the copy of " +
        D.OUT_REL +
        " at merge base " +
        at.mergeBase +
        " names no slugs, so every component would read as new and the " +
        "comparison would pass having compared nothing",
    );
    return at.json;
  }

  const introducing =
    at.mergeBase &&
    !at.corrupt &&
    mergeBase.addedSince(at.mergeBase, D.OUT_REL);
  if (!introducing) {
    assert.fail(mergeBase.describeMissing("sparse-render-ratchet", at));
  }

  const committedPath = path.join(REPO_ROOT, D.OUT_REL);
  assert.ok(
    fs.existsSync(committedPath),
    "sparse-render-ratchet: this branch adds " +
      D.OUT_REL +
      " but the working tree has no copy of it, so nothing measures anything here",
  );
  process.stderr.write(
    "NOTE sparse-render-ratchet: this branch ADDS " +
      D.OUT_REL +
      " (merge base " +
      at.mergeBase +
      " predates it), so this run compares against the committed copy. That is " +
      "the introducing commit's own baseline, and the only case in which this " +
      "path is taken.\n",
  );
  return JSON.parse(fs.readFileSync(committedPath, "utf8"));
}

const BASE = baselineArtifact();

test("no component invents a part it did not render before, per slug and in total", function () {
  const before = BASE.bySlug || {};
  const after = fresh.bySlug;

  const worse = risesAgainst(before, after, ACCEPTED_RISE);
  const totals = comparableTotals(before, after);
  const headroom = headroomFor(before, after, ACCEPTED_RISE);

  // How many components this run actually compared. Zero is the vacuous pass
  // this whole file exists to avoid: a baseline sharing no slug with the current
  // renderer would leave every count outside the comparison and go green having
  // watched nothing.
  assert.ok(
    totals.common.length > 0,
    "no component was compared against the baseline at all, so this ratchet " +
      "would pass vacuously: " +
      Object.keys(after).length +
      " slugs measured, " +
      Object.keys(before).length +
      " in the baseline, none in common",
  );

  assert.deepEqual(worse, [], perSlugMessage(worse, before, after));
  assert.ok(
    totals.to - headroom <= totals.from,
    totalMessage(headroom, before, after),
  );
});

test("no prop starts replacing content the renderer invented for it", function () {
  // The complement, and the half that catches the shape the count cannot see. A
  // prop may ADD to the markup; the moment supplying it REMOVES something the
  // empty render had, the renderer is carrying content of its own for that prop
  // and the caller cannot get the component without it.
  //
  // This set has legitimate members and always will: many props have a designed
  // fallback. It is ratcheted, not emptied.
  const before = BASE.inventedSlots || [];
  const after = fresh.inventedSlots;
  assert.ok(
    before.length > 0,
    "the baseline names no invented slots at all, so every pair would read as " +
      "pre-existing and this comparison would pass vacuously",
  );

  const added = newlyInvented(before, after, ACCEPTED_INVENTED);
  assert.deepEqual(added, [], inventedMessage(added, before, after));
});

test("the measurement covers every slug the renderer implements", function () {
  // Non-vacuity, at the right grain: a renderer change that made 30 slugs
  // unmeasurable would leave a comfortably positive count while the ratchet
  // stopped watching most of the tier, so the subject is asserted per slug.
  //
  // Checked against matrix.RENDER_SLUGS, which reads the renderer's own `case`
  // markers. The first version compared the measurement against a contract
  // derived in the same call it came from, which is the same number twice: it
  // could only have failed if deriveContract were nondeterministic.
  const matrix = require(
    path.join(REPO_ROOT, "components/render/renderer/matrix.js"),
  );
  const implemented = matrix.RENDER_SLUGS.slice().sort();
  const measured = Object.keys(fresh.bySlug).sort();
  assert.ok(
    implemented.length > 0,
    "the renderer implements no slugs, so this file measured nothing at all",
  );
  assert.deepEqual(
    measured,
    implemented,
    "the sparse measurement and the renderer disagree about which components " +
      "exist, so some slug is going unwatched",
  );
  // And every measured slug carries a real number rather than an absent one, so
  // a slug present in the map with nothing behind it cannot read as covered.
  const notMeasured = measured.filter(function (slug) {
    return typeof fresh.bySlug[slug] !== "number";
  });
  assert.deepEqual(notMeasured, []);
});

test("every waiver names a real slug or pair, and is usable as written", function () {
  const unknownSlugs = Object.keys(ACCEPTED_RISE).filter(function (slug) {
    return !hasOwn(fresh.bySlug, slug);
  });
  assert.deepEqual(
    unknownSlugs,
    [],
    "accepted rises naming components that no longer exist: " +
      JSON.stringify(unknownSlugs),
  );
  const unknownPairs = Object.keys(ACCEPTED_INVENTED).filter(function (pair) {
    const slug = pair.slice(0, pair.indexOf("."));
    return !hasOwn(fresh.bySlug, slug);
  });
  assert.deepEqual(
    unknownPairs,
    [],
    "accepted invented slots naming components that no longer exist: " +
      JSON.stringify(unknownPairs),
  );
  assert.deepEqual(malformedWaivers(ACCEPTED_RISE), []);
  assert.deepEqual(malformedInventedWaivers(ACCEPTED_INVENTED), []);

  // Both maps are empty at landing, so every assertion above would read as an
  // all-clear from a broken predicate just as easily as from a clean map. The
  // same predicates over fabricated entries, to prove they CAN fail.
  assert.deepEqual(
    Object.keys({ "no-such-component": {} }).filter(function (slug) {
      return !hasOwn(fresh.bySlug, slug);
    }),
    ["no-such-component"],
    "the staleness predicate must report a slug the renderer does not have",
  );
  assert.deepEqual(
    malformedWaivers({ a: { from: 1, to: 2, reason: "  " } }),
    ["a"],
    "a whitespace-only reason is no reason",
  );
});

// --- the comparison itself, proven able to go red ---------------------------

test("a rise is reported, names the slug, and states both counts", function () {
  const worse = risesAgainst(
    { "page-header": 1, badge: 0 },
    { "page-header": 2, badge: 0 },
    {},
  );
  assert.deepEqual(worse, ["page-header: 1 -> 2"]);
});

test("a fall is not a rise, and neither is a slug the baseline never had", function () {
  assert.deepEqual(risesAgainst({ a: 3 }, { a: 1 }, {}), []);
  assert.deepEqual(risesAgainst({}, { brandNew: 4 }, {}), []);
});

// --- the escape hatch, which is itself a way to go silent -------------------

test("a waiver with no reason waives nothing", function () {
  // The first version read only `hasOwnProperty(accepted, slug)`, so an entry
  // with an empty value waived the rise while the docs promised a reason was
  // required. The value is read now, and a blank one is not a reason.
  const before = { a: 1 };
  const after = { a: 2 };
  assert.deepEqual(risesAgainst(before, after, { a: { from: 1, to: 2 } }), [
    "a: 1 -> 2",
  ]);
  assert.deepEqual(
    risesAgainst(before, after, { a: { from: 1, to: 2, reason: "" } }),
    ["a: 1 -> 2"],
  );
  assert.deepEqual(
    risesAgainst(before, after, { a: { from: 1, to: 2, reason: "   \n" } }),
    ["a: 1 -> 2"],
  );
  assert.deepEqual(
    malformedWaivers({ a: { from: 1, to: 2 } }),
    ["a"],
    "an unusable waiver must be named, not ignored",
  );
});

test("a waiver covers the rise it was written for and no other", function () {
  // The second silent shape: a waiver written for 1 -> 2 sat in the map after
  // the rise was baselined and then covered every later rise on that slug. It
  // waives its own rise and nothing else.
  const waiver = { a: { from: 1, to: 2, reason: "the part is mandatory now" } };
  assert.deepEqual(risesAgainst({ a: 1 }, { a: 2 }, waiver), []);
  assert.deepEqual(
    risesAgainst({ a: 1 }, { a: 9 }, waiver),
    ["a: 1 -> 9"],
    "a bigger rise than the one waived is a different rise",
  );
  assert.deepEqual(
    risesAgainst({ a: 2 }, { a: 3 }, waiver),
    ["a: 2 -> 3"],
    "once the waived rise is in the baseline, the waiver is inert",
  );
});

test("a waiver waives only the slug it names, and buys exactly its own headroom", function () {
  const before = { a: 1, b: 1 };
  const after = { a: 2, b: 2 };
  const waiver = { a: { from: 1, to: 2, reason: "by design" } };
  assert.deepEqual(risesAgainst(before, after, waiver), ["b: 1 -> 2"]);
  assert.equal(headroomFor(before, after, waiver), 1);
  assert.equal(
    headroomFor(before, after, { a: { from: 1, to: 2 } }),
    0,
    "a reasonless waiver buys no headroom either",
  );
});

test("the total compares the same components on both sides", function () {
  // A retired slug used to pay for a rise elsewhere, because its count sat in
  // the baseline total with nothing on the other side. A newly added one used to
  // need headroom for the mirror-image reason. Neither is in the total now.
  const t = comparableTotals({ a: 1, retired: 7 }, { a: 1, brandNew: 5 });
  assert.deepEqual(t.common, ["a"]);
  assert.equal(t.from, 1);
  assert.equal(t.to, 1);
  assert.equal(headroomFor({ a: 1 }, { a: 1, brandNew: 5 }, {}), 0);
});

// --- the complement: props that replace invented content --------------------

test("a newly invented slot is reported, and a pre-existing one is not", function () {
  assert.deepEqual(
    newlyInvented(["x.A"], ["x.A", "y.B"], {}),
    ["y.B"],
    "only the pair that was not there before",
  );
  assert.deepEqual(newlyInvented(["x.A", "y.B"], ["x.A"], {}), []);
});

test("an invented-slot waiver needs a reason too", function () {
  assert.deepEqual(newlyInvented([], ["y.B"], { "y.B": "" }), ["y.B"]);
  assert.deepEqual(newlyInvented([], ["y.B"], { "y.B": "   " }), ["y.B"]);
  assert.deepEqual(
    newlyInvented([], ["y.B"], { "y.B": "the empty state needs a headline" }),
    [],
  );
  assert.deepEqual(malformedInventedWaivers({ "y.B": " " }), ["y.B"]);
});

test("supplying a prop may add markup, never take it away", function () {
  // The property the complement is built on, at the size where it can be read.
  // Insertion only, which is what an optional element looks like:
  assert.equal(
    D.isSubsequence("<div><h1>T</h1></div>", "<div><h1>T</h1><p></p></div>"),
    true,
  );
  // The three shapes the sparse count cannot see, each one a removal:
  assert.equal(
    D.isSubsequence('<p class="b">Support text</p>', '<p class="b"></p>'),
    false,
    "a fallback in the element's own text",
  );
  assert.equal(
    D.isSubsequence(
      "<button>New chat on Customer Orders</button>",
      "<button>New chat on </button>",
    ),
    false,
    "a fallback injected into an element that already carries text",
  );
  assert.equal(
    D.isSubsequence(
      '<input placeholder="Search datasets"/>',
      '<input placeholder=""/>',
    ),
    false,
    "a fallback carried by an attribute",
  );
  assert.equal(
    D.isSubsequence(
      "<svg><title>Star</title></svg>",
      "<svg><title></title></svg>",
    ),
    false,
    "a fallback inside an svg",
  );
});

test("the headline states the real direction, all three ways, for both measures", function () {
  // The half of the fidelity gate's direction lesson that is cheap to keep: a
  // message that says the number rose when it fell teaches the reader to stop
  // reading the message.
  assert.match(totalDirection({ a: 1 }, { a: 3 }), /ROSE: 1 -> 3\./);
  assert.doesNotMatch(totalDirection({ a: 1 }, { a: 3 }), /FELL|UNCHANGED/);
  assert.match(totalDirection({ a: 3 }, { a: 1 }), /FELL: 3 -> 1\./);
  assert.doesNotMatch(totalDirection({ a: 3 }, { a: 1 }), /ROSE|UNCHANGED/);
  assert.match(totalDirection({ a: 2 }, { a: 2 }), /UNCHANGED: 2 -> 2\./);
  assert.doesNotMatch(totalDirection({ a: 2 }, { a: 2 }), /ROSE|FELL/);

  assert.match(inventedDirection([], ["y.B"]), /GREW: 0 -> 1\./);
  assert.doesNotMatch(inventedDirection([], ["y.B"]), /SHRANK|UNCHANGED/);
  assert.match(inventedDirection(["y.B"], []), /SHRANK: 1 -> 0\./);
  assert.match(inventedDirection(["y.B"], ["y.B"]), /UNCHANGED: 1 -> 1\./);
});

test("the blocking messages name the subject, both counts, and the way out", function () {
  const before = { "page-header": 1 };
  const after = { "page-header": 2 };
  const perSlug = perSlugMessage(
    risesAgainst(before, after, {}),
    before,
    after,
  );
  assert.match(perSlug, /page-header: 1 -> 2/);
  assert.match(perSlug, /BLOCKS/, "a per-slug rise blocks, and must say so");
  assert.match(perSlug, /SPECIMEN_PROPS/);
  assert.match(perSlug, /ACCEPTED_RISE/, "the escape hatch is named");
  const total = totalMessage(0, before, after);
  assert.match(total, /ROSE: 1 -> 2/);
  assert.match(total, /ACCEPTED_RISE/);

  const invented = inventedMessage(
    ["chat-with-ai-steward.Source"],
    [],
    ["chat-with-ai-steward.Source"],
  );
  assert.match(invented, /chat-with-ai-steward\.Source/);
  assert.match(invented, /GREW: 0 -> 1/);
  assert.match(invented, /ACCEPTED_INVENTED/);
});

test("no failure message tells the reader to regenerate or re-baseline", function () {
  // The failure has to name the defect, never the way to make the red go away.
  // "Regenerate and commit" launders a regression into a chore, and a ratchet
  // that advises it is a formality. Read off the real message builders, so the
  // check follows the wording instead of restating it.
  const before = { "page-header": 1 };
  const after = { "page-header": 2 };
  const messages = [
    perSlugMessage(risesAgainst(before, after, {}), before, after),
    totalMessage(0, before, after),
    totalDirection(before, after),
    inventedMessage(["x.A"], [], ["x.A"]),
    inventedDirection([], ["x.A"]),
  ];
  const LAUNDERING =
    /re-?generate|re-?baseline|update the (baseline|artifact)|commit the result/i;
  messages.forEach(function (m) {
    assert.doesNotMatch(m, LAUNDERING, m);
  });
  // Positive control: the predicate must catch the advice it is looking for,
  // otherwise three clean messages read as an all-clear from a dead regex.
  assert.match(
    "run `npm run derive:render` and commit the result",
    LAUNDERING,
    "the laundering predicate must recognise the advice it forbids",
  );
});

// --- what "a part" means ----------------------------------------------------

test("the counter counts elements carrying text, not tags and not characters", function () {
  const t = D.textBearingElements;
  assert.equal(t("<div><p>Hi</p></div>"), 1, "one element carries the text");
  assert.equal(t("<div><p></p></div>"), 0, "an empty element is not a part");
  assert.equal(t("<div>   \n </div>"), 0, "whitespace is not text");
  assert.equal(
    t("<div>Source: <a>orders</a></div>"),
    2,
    "mixed content is two parts: the wrapper's own text and the link's",
  );
  assert.equal(t("<p>a</p><p>b</p><p>c</p>"), 3, "siblings each count once");
  assert.equal(
    t("<p>one two three four five</p>"),
    1,
    "a longer sentence is still one part, so copy edits do not move the number",
  );
});

test("the counter reads text, never attributes or icon geometry", function () {
  const t = D.textBearingElements;
  assert.equal(
    t('<input class="x" placeholder="Give Steward a task"/>'),
    0,
    "a placeholder belongs to an element that already exists",
  );
  assert.equal(
    t(
      '<span aria-label="Generated by AI"><svg><title>Star</title></svg></span>',
    ),
    0,
    "an icon's own markup is geometry, not a part",
  );
});

test("a void element does not swallow the text after it", function () {
  // The shape that made this worth pinning: chat-with-ai-steward's task input is
  // `<input/>` followed by the context chip. Treat <input> as opening a scope and
  // the chip's text is attributed to it, the input never closes, and every later
  // sibling disappears into it, so the very regression this file exists for
  // would measure as no change at all.
  assert.equal(
    D.textBearingElements(
      '<div><input type="text"/><span>Dataset Customer Orders</span><button>Plan</button></div>',
    ),
    2,
  );
});

test("the counter sees a fallback that adds an element, in either shape", function () {
  // The two shapes the renderer actually uses, each one turned into markup the
  // way the renderer would emit it. The conditional shape is the one #544 fixed;
  // the initialiser shape is the one it missed. Both arrive here as a NEW element
  // with text in it, which is why this measurement did not need to know the
  // difference between them.
  const withoutPart = "<div><h2>Title</h2></div>";
  const conditionalFallback =
    '<div><h2>Title</h2><p class="d">Support text</p></div>';
  const initialiserFallback =
    '<div><h2>Title</h2><span class="chip">Dataset Customer Orders</span></div>';
  assert.equal(D.textBearingElements(withoutPart), 1);
  assert.equal(D.textBearingElements(conditionalFallback), 2);
  assert.equal(D.textBearingElements(initialiserFallback), 2);
});

test("the counter is BLIND to a fallback injected into an element that already has text", function () {
  // Pinned as a limitation, not as a capability, because a gate believed to
  // cover more than it does is worse than no gate. An element is counted once,
  // so text appended inside one that already carries text moves nothing. This is
  // the review's exploit in miniature, and it is why the complement above exists
  // and why the header of the derive names this blind spot in words.
  assert.equal(D.textBearingElements("<button>New chat</button>"), 1);
  assert.equal(
    D.textBearingElements("<button>New chat on Customer Orders</button>"),
    1,
    "the count cannot see this; the invented-slot set is what does",
  );
});

// --- the artifact -----------------------------------------------------------

test("the committed measurement matches a fresh one", function () {
  // The committed artifact is the next branch's baseline, so a stale one either
  // hides a rise or reds a PR that caused none. render-derive.yml regenerates
  // and commits it; this is the check that says when it must.
  const committed = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, D.OUT_REL), "utf8"),
  );
  // The WHOLE artifact, not a chosen field. Comparing bySlug and totals only
  // left _meta and schemaVersion unwatched, which are exactly the fields a hand
  // edit reaches for: an artifact whose stamp says something the derive does not
  // is how a generated file starts being treated as editable.
  assert.deepEqual(committed, fresh, "the committed artifact is stale");
});

test("the artifact publishes the scope of what it measured", function () {
  // The scope figures are the honest half of this gate: they say how much of the
  // surface the two measurements do NOT reach, and they are measured on every
  // run so the claim cannot age the way a comment does. Only the relations are
  // asserted, never the values: pinning "132 of 177" here would be a
  // hand-maintained number in a gate, and a real improvement to either figure
  // would then read as a failure.
  const t = fresh.totals;
  assert.ok(
    t.pairsProbed <= t.pairsInContract,
    "more pairs were probed than the contract lists",
  );
  assert.ok(t.pairsProbed > 0, "no (slug, prop) pair was probed at all");
  assert.equal(
    t.cellsRendered,
    t.slugs,
    "both measurements are sparse: exactly one cell per slug",
  );
  assert.ok(
    t.matrixCells >= t.cellsRendered,
    "the matrix cannot have fewer cells than the slugs rendered from it",
  );
});

test("the artifact is stamped as generated, and names its source", function () {
  assert.equal(fresh._meta.auto_generated, true);
  assert.match(fresh._meta.source, /ds-html-map\.js/);
  assert.ok(fresh._meta.do_not_edit);
});

test("the artifact validates against schemas/sparse-render.json", function () {
  const Ajv2020 = require("ajv/dist/2020");
  const addFormats = require("ajv-formats");
  const schema = require("../../schemas/sparse-render.json");
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.ok(validate(fresh), JSON.stringify(validate.errors));
});

test("the working-tree fallback is gated on this branch actually adding the file", function () {
  // The gate that keeps the fallback from being a permanent hole. render-derive
  // checks out the PR head repo, so on a fork PR `origin` is the FORK: a
  // contributor whose fork is behind gets a merge base older than this artifact,
  // and an ungated fallback would compare their fresh derive against its own
  // output, forever, on a green run.
  const at = mergeBase.jsonAtMergeBase(D.OUT_REL);
  assert.ok(
    at.mergeBase,
    mergeBase.describeMissing("sparse-render-ratchet", at),
  );
  // Negative control first: a file that has been in the tree far longer than
  // this branch must NOT read as added by it. Without this, a gate that always
  // answered "yes" would look exactly like a working one.
  assert.equal(
    mergeBase.addedSince(at.mergeBase, "README.md"),
    false,
    "the introducing-commit gate must not call an old file newly added",
  );
  // And the two states agree: the fallback path is entered only when the merge
  // base lacks the artifact AND this branch is the one adding it.
  if (!at.json) {
    assert.equal(
      mergeBase.addedSince(at.mergeBase, D.OUT_REL),
      true,
      "the fallback was taken, so this branch must be the introducing commit",
    );
  }
});

test("a merge base that lacks the file keeps looking, a corrupt one does not", function () {
  // The recovery path, as a rule rather than as a code path: a stale local
  // `origin/main` resolves a merge base that predates the artifact, and the
  // `git fetch` fallback is what heals it. An earlier version returned on the
  // first resolved merge base, so a developer who had not fetched since the
  // artifact landed got a hard failure the fetch would have fixed. Corruption is
  // different: it is a fault to report, not a reason to look elsewhere.
  assert.equal(mergeBase.endsTheSearch({ json: { bySlug: {} } }), true);
  assert.equal(mergeBase.endsTheSearch({ json: null, corrupt: true }), true);
  assert.equal(
    mergeBase.endsTheSearch({ json: null, corrupt: false }),
    false,
    "a merge base that simply does not carry the file must not end the search",
  );
});

test("the measurement does not depend on the icon or artwork maps", function () {
  // The derive tolerates absent assets, and this is the assertion that tolerance
  // rests on: renderIcon() returns the empty string for a glyph it does not
  // have, so no asset can add or remove a text-bearing element. The day one of
  // them grows a text fallback ("[missing icon]"), the counts diverge and this
  // says so, instead of the artifact quietly measuring one thing in CI and
  // another in a checkout without the icons dist.
  const bare = D.measureSparse({ icons: {}, graphics: {} });
  assert.deepEqual(
    bare.bySlug,
    fresh.bySlug,
    "an asset map changed the sparse counts, so the derive may no longer " +
      "tolerate an absent one",
  );
  assert.deepEqual(
    bare.inventedSlots,
    fresh.inventedSlots,
    "an asset map changed which props displace invented content",
  );
});

test("a slug that cannot render stops the derive instead of shrinking it", function () {
  // The alternative is a measurement that skips what it cannot reach and
  // publishes a smaller truth in the shape of a complete artifact. That is how
  // the emptiness probe once fell from 58 slugs to 28 while staying green.
  // Provoked by making one render throw, because no real slug can be made to:
  // the renderer degrades an unknown slug to a chip rather than failing.
  const dsMap = require(
    path.join(
      REPO_ROOT,
      "components/render/renderer/html-renderers/ds-html-map.js",
    ),
  );
  const real = dsMap.renderDSComponent;
  dsMap.renderDSComponent = function () {
    throw new Error("render exploded");
  };
  try {
    assert.throws(function () {
      D.measureSparse({ slugs: ["badge"], icons: {}, graphics: {} });
    }, /render exploded/);
  } finally {
    dsMap.renderDSComponent = real;
  }
  // Positive control for the patch itself: with the real renderer back, the same
  // call measures rather than throws, so the assertion above cannot be passing
  // for some unrelated reason.
  assert.equal(
    typeof D.measureSparse({ slugs: ["badge"], icons: {}, graphics: {} }).bySlug
      .badge,
    "number",
  );
});
