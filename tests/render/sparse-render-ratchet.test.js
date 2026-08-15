"use strict";

// THE SPARSE RENDER RATCHET.
//
// The property, stated directly: a component must not invent parts the caller
// did not ask for. Every slug in the render contract is rendered with NO props
// at all and its visible text-bearing elements are counted; the count may fall,
// it may not rise.
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
// A guard keyed on a list checks the things somebody remembered to list. This
// one takes no list of slots and no list of props: it reads the slugs from the
// contract and it reads the ANSWER off the rendered markup, so a fallback added
// in any shape at all moves the number.
//
// The number is not a target. 44 of the 58 slugs render some visible text with
// nothing supplied and most of it is legitimate structural chrome. Only the
// direction is gated.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const mergeBase = require("./helpers/merge-base.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const D = require(
  path.join(REPO_ROOT, "scripts", "render", "derive-sparse-render.js"),
);
const { deriveContract } = require(
  path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
);

// Measured NOW from the renderer in the working tree, never read from the
// committed dist: on a branch that has not yet run its own derive the dist is
// stale by construction, and on a branch that has, comparing dist to dist is
// new-against-new and always passes.
const fresh = D.measureSparse();

// Escape hatch, the same shape as variant-collapse-ratchet's ACCEPTED_RISE and
// the fidelity gate's --accept-coverage-loss="<why>": a rise is allowed only by
// naming the slug with a reason, so a decision to ship a new unconditional part
// reads like a decision in the diff. A rise can be legitimate (a component can
// genuinely gain a part by design, and a redesign can make a part mandatory).
// It may not be silent.
//
// Each key must still name a real slug, asserted below, so a key left behind by
// a rename cannot quietly cover a different regression later.
const ACCEPTED_RISE = {
  // "some-slug": "why this component legitimately renders a new part with no props",
};

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

// Pure, and exported to the tests below as its own subject: the comparison is
// the part that has to be able to go red, and proving that on the real corpus
// would mean breaking the renderer to watch it work.
function risesAgainst(before, after, accepted) {
  return Object.keys(after)
    .filter(function (slug) {
      return (
        hasOwn(before, slug) &&
        after[slug] > before[slug] &&
        !hasOwn(accepted, slug)
      );
    })
    .sort()
    .map(function (slug) {
      return slug + ": " + before[slug] + " -> " + after[slug];
    });
}

// Headroom, so the total never reds for something the per-slug check has already
// allowed. Two sources: slugs the baseline did not have (a new component's
// sparse content is a NEW FACT, not a regression, and a Figma sync adding one is
// the common case), and rises named in ACCEPTED_RISE. Slugs that DISAPPEAR need
// no headroom, they only lower the total.
function headroomFor(before, after, accepted) {
  return Object.keys(after).reduce(function (a, slug) {
    if (!hasOwn(before, slug)) return a + after[slug];
    if (hasOwn(accepted, slug) && after[slug] > before[slug]) {
      return a + (after[slug] - before[slug]);
    }
    return a;
  }, 0);
}

function sum(o) {
  return Object.keys(o).reduce(function (a, k) {
    return a + o[k];
  }, 0);
}

// DIRECTION, stated in the total's own terms and carried by BOTH messages. The
// blocking condition is compound (a per-slug rise OR a rise in the repo-wide
// total), so a report that mentions only one of them misstates the other: the
// fidelity gate announced a 60% coverage GAIN as a regression exactly once, and
// a reader who is told the wrong direction stops believing the gate. The
// per-slug list is the subject; this is the headline next to it, and it never
// says "regressed" about a fall.
function totalDirection(before, after) {
  const from = sum(before);
  const to = sum(after);
  const word = to > from ? "ROSE" : to < from ? "FELL" : "UNCHANGED";
  return (
    "Repo-wide, sparse text-bearing elements " +
    word +
    ": " +
    from +
    " -> " +
    to +
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
    "the slug in ACCEPTED_RISE with a reason."
  );
}

function totalMessage(headroom, before, after) {
  return (
    "the render tier as a whole invents more than it did at the merge base. " +
    totalDirection(before, after) +
    " " +
    headroom +
    " of the rise is already allowed (slugs absent from the baseline, plus any " +
    "named in ACCEPTED_RISE). Each of these elements is a part a caller cannot " +
    "switch off. Move the content to matrix.js SPECIMEN_PROPS, or name the " +
    "slug in ACCEPTED_RISE with a reason."
  );
}

// The baseline is the artifact as it stood at the MERGE BASE, resolved by
// helpers/merge-base.js (shared with variant-collapse-ratchet).
//
// The one fallback: on the commit that INTRODUCES this artifact the merge base
// does not carry it, and that is the only case in which the committed copy is
// read instead. It is narrow (git resolved a merge base, the file simply is not
// in it), it is loud, and it cannot recur once this has landed on the base
// branch. A merge base that cannot be resolved at all is a different condition
// and fails, because a silent pass there would mean the ratchet asserted
// nothing while still going green.
function baseline() {
  const at = mergeBase.jsonAtMergeBase(D.OUT_REL);
  if (!at.mergeBase) {
    assert.fail(
      mergeBase.unresolvedMessage("sparse-render-ratchet", D.OUT_REL),
    );
  }
  if (at.corrupt) {
    assert.fail(
      "sparse-render-ratchet: the copy of " +
        D.OUT_REL +
        " at merge base " +
        at.mergeBase +
        " is not parseable JSON, so there is no baseline to compare against. " +
        "A corrupt baseline is not a pass.",
    );
  }
  if (at.json) {
    // A baseline with no per-slug entries is worse than no baseline: every slug
    // reads as absent from it, absence buys headroom, and the whole comparison
    // passes having compared nothing. It fails here instead.
    const bySlug = at.json.bySlug || {};
    assert.ok(
      Object.keys(bySlug).length > 0,
      "sparse-render-ratchet: the copy of " +
        D.OUT_REL +
        " at merge base " +
        at.mergeBase +
        " names no slugs, so every component would read as new and the " +
        "comparison would pass having compared nothing",
    );
    return bySlug;
  }

  const committedPath = path.join(REPO_ROOT, D.OUT_REL);
  assert.ok(
    fs.existsSync(committedPath),
    "sparse-render-ratchet: merge base " +
      at.mergeBase +
      " does not carry " +
      D.OUT_REL +
      " and neither does the working tree, so nothing measures anything here",
  );
  process.stderr.write(
    "NOTE sparse-render-ratchet: merge base " +
      at.mergeBase +
      " does not carry " +
      D.OUT_REL +
      " yet, so this run compares against the committed copy instead. That is " +
      "the introducing commit's own baseline and happens exactly once.\n",
  );
  return JSON.parse(fs.readFileSync(committedPath, "utf8")).bySlug || {};
}

test("no component invents a part it did not render before, per slug and in total", function () {
  const before = baseline();
  const after = fresh.bySlug;

  const worse = risesAgainst(before, after, ACCEPTED_RISE);
  const totalBefore = sum(before);
  const totalAfter = sum(after);
  const headroom = headroomFor(before, after, ACCEPTED_RISE);

  // How many components this run actually compared. Zero is the vacuous pass
  // this whole file exists to avoid: a baseline sharing no slug with the current
  // renderer would send every count through the new-slug headroom and go green
  // having watched nothing.
  const compared = Object.keys(after).filter(function (slug) {
    return hasOwn(before, slug);
  }).length;
  assert.ok(
    compared > 0,
    "no component was compared against the baseline at all, so this ratchet " +
      "would pass vacuously: " +
      Object.keys(after).length +
      " slugs measured, " +
      Object.keys(before).length +
      " in the baseline, none in common",
  );

  assert.deepEqual(worse, [], perSlugMessage(worse, before, after));
  assert.ok(
    totalAfter - headroom <= totalBefore,
    totalMessage(headroom, before, after),
  );
});

test("the measurement covers every slug the contract has", function () {
  // Non-vacuity, at the right grain. `> 0` is the global version and it is too
  // weak: a renderer change that made 30 slugs throw would leave a comfortably
  // positive count while the ratchet stopped watching most of the tier. The
  // subject is asserted per slug, and both sides are derived.
  const contractSlugs = Object.keys(deriveContract().slugs).sort();
  const measured = Object.keys(fresh.bySlug).sort();
  assert.ok(
    contractSlugs.length > 0,
    "the contract named no slugs, so this file measured nothing at all",
  );
  assert.deepEqual(
    measured,
    contractSlugs,
    "the sparse measurement and the render contract disagree about which " +
      "components exist, so some slug is going unwatched",
  );
});

test("every accepted rise still names a real slug", function () {
  const unknown = Object.keys(ACCEPTED_RISE).filter(function (slug) {
    return !hasOwn(fresh.bySlug, slug);
  });
  assert.deepEqual(
    unknown,
    [],
    "accepted rises naming components that no longer exist: " +
      JSON.stringify(unknown),
  );
  // ACCEPTED_RISE is empty at landing, so the assertion above cannot fail on its
  // own contents and would read as an all-clear from a broken predicate just as
  // easily as from an empty map. Run the same predicate over a fabricated key to
  // prove it CAN fail.
  assert.deepEqual(
    Object.keys({ "no-such-component": "fabricated" }).filter(function (slug) {
      return !hasOwn(fresh.bySlug, slug);
    }),
    ["no-such-component"],
    "the staleness predicate must report a slug the renderer does not have",
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

test("an accepted rise is waived, and only for the slug it names", function () {
  const before = { a: 1, b: 1 };
  const after = { a: 2, b: 2 };
  assert.deepEqual(risesAgainst(before, after, { a: "by design" }), [
    "b: 1 -> 2",
  ]);
  assert.equal(headroomFor(before, after, { a: "by design" }), 1);
});

test("a slug absent from the baseline buys headroom, so a new component cannot red the total", function () {
  assert.equal(headroomFor({ a: 1 }, { a: 1, fresh: 5 }, {}), 5);
});

test("the headline states the total's real direction, all three ways", function () {
  // The half of the fidelity gate's direction lesson that is cheap to keep: a
  // message that says the number rose when it fell teaches the reader to stop
  // reading the message.
  assert.match(totalDirection({ a: 1 }, { a: 3 }), /ROSE: 1 -> 3\./);
  assert.doesNotMatch(totalDirection({ a: 1 }, { a: 3 }), /FELL|UNCHANGED/);
  assert.match(totalDirection({ a: 3 }, { a: 1 }), /FELL: 3 -> 1\./);
  assert.doesNotMatch(totalDirection({ a: 3 }, { a: 1 }), /ROSE|UNCHANGED/);
  assert.match(totalDirection({ a: 2 }, { a: 2 }), /UNCHANGED: 2 -> 2\./);
  assert.doesNotMatch(totalDirection({ a: 2 }, { a: 2 }), /ROSE|FELL/);
});

test("the blocking messages name the slug, both counts, and the way out", function () {
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

test("the counter sees a literal fallback whatever shape it is written in", function () {
  // The three shapes the renderer actually uses, each one turned into markup the
  // way the renderer would emit it. The conditional shape is the one #544 fixed;
  // the initialiser shape is the one it missed. Both arrive here as an element
  // with text in it, which is why this measurement did not need to know the
  // difference.
  const withoutPart = "<div><h2>Title</h2></div>";
  const conditionalFallback =
    '<div><h2>Title</h2><p class="d">Support text</p></div>';
  const initialiserFallback =
    '<div><h2>Title</h2><span class="chip">Dataset Customer Orders</span></div>';
  assert.equal(D.textBearingElements(withoutPart), 1);
  assert.equal(D.textBearingElements(conditionalFallback), 2);
  assert.equal(D.textBearingElements(initialiserFallback), 2);
});

// --- the artifact -----------------------------------------------------------

test("the committed measurement matches a fresh one", function () {
  // The committed artifact is the next branch's baseline, so a stale one either
  // hides a rise or reds a PR that caused none. render-derive.yml regenerates
  // and commits it; this is the check that says when it must.
  const committed = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, D.OUT_REL), "utf8"),
  );
  assert.deepEqual(committed.bySlug, fresh.bySlug);
  assert.deepEqual(committed.totals, fresh.totals);
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
