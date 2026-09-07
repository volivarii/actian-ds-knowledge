"use strict";

// The geometry disagreement count may FALL. It may not rise.
//
// derive-geometry-fidelity.js reports rather than blocks, because the first run
// finds a backlog and a gate that reds the build on its first sight of one gets
// waved through rather than worked. This is what makes that safe: the count is
// pinned to the merge base, per slug and in total, so the backlog can only be
// worked down. A rise is either a real regression or a Figma sync that moved
// the capture, and both are things a person has to look at rather than absorb.
//
// PER SLUG as well as in total, because a total alone passes a swap: one
// component repaired and another broken by the same commit nets to zero.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mergeBase = require("./helpers/merge-base.js");
const D = require("../../scripts/render/derive-geometry-fidelity.js");
const MATRIX = require("../../components/render/renderer/matrix.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Measured once, from the working tree, and shared. Deriving per test would run
// the whole corpus a dozen times for one number.
const fresh = D.measureGeometry();

// A rise a person has looked at and accepted, keyed slug -> reason. A rise with
// no entry here fails; an entry with no reason waives nothing (see the test
// below). Empty on purpose: the mechanism exists so a legitimate rise has a way
// through that leaves a written reason, not so the count can drift.
const ACCEPTED_RISE = {};

function reasonFor(slug) {
  const r = ACCEPTED_RISE[slug];
  return typeof r === "string" && r.trim() ? r.trim() : null;
}

/**
 * The artifact at the merge base. Same resolution the sparse ratchet uses, and
 * the same one-time fallback for the commit that INTRODUCES the file, which is
 * the only case where no baseline can exist.
 */
function baselineArtifact() {
  const at = mergeBase.jsonAtMergeBase(D.OUT_REL);
  if (at.json) {
    // A baseline naming no slugs is worse than none: every slug reads as new,
    // new is excluded from the comparison, and the gate passes having compared
    // nothing.
    assert.ok(
      Object.keys(at.json.bySlug || {}).length > 0,
      "geometry-ratchet: the copy of " +
        D.OUT_REL +
        " at merge base " +
        at.mergeBase +
        " names no slugs, so every component would read as new and this would " +
        "pass having compared nothing",
    );
    return at.json;
  }

  const introducing =
    at.mergeBase && !at.corrupt && mergeBase.addedSince(at.mergeBase, D.OUT_REL);
  if (!introducing) assert.fail(mergeBase.describeMissing("geometry-ratchet", at));

  const committedPath = path.join(REPO_ROOT, D.OUT_REL);
  assert.ok(
    fs.existsSync(committedPath),
    "geometry-ratchet: this branch adds " +
      D.OUT_REL +
      " but the working tree has no copy, so nothing here measures anything",
  );
  process.stderr.write(
    "NOTE geometry-ratchet: this branch ADDS " +
      D.OUT_REL +
      " (merge base " +
      at.mergeBase +
      " predates it), so this run compares against the committed copy. That is " +
      "the introducing commit's own baseline, and the only case that takes " +
      "this path.\n",
  );
  return JSON.parse(fs.readFileSync(committedPath, "utf8"));
}

const BASE = baselineArtifact();

/** Slugs whose mismatch count rose, with both numbers and any waiver. */
function risesAgainst(before, after, accepted) {
  const out = [];
  for (const slug of Object.keys(after).sort()) {
    const was = before[slug];
    // A slug the baseline does not have is NEW, not a rise. Its declarations
    // enter the total, which the total check below covers.
    if (!was) continue;
    const from = was.mismatch || 0;
    const to = after[slug].mismatch || 0;
    if (to <= from) continue;
    out.push({ slug: slug, from: from, to: to, reason: (accepted || {})[slug] });
  }
  return out;
}

/** Totals over the slugs BOTH sides have, so a new slug cannot read as a rise. */
function comparableTotals(before, after) {
  let from = 0;
  let to = 0;
  for (const slug of Object.keys(after)) {
    if (!before[slug]) continue;
    from += before[slug].mismatch || 0;
    to += after[slug].mismatch || 0;
  }
  return { from: from, to: to };
}

/** Headroom a waiver buys: exactly the rise it was written for, no more. */
function unwaived(rises) {
  return rises.filter(function (r) {
    return !reasonFor(r.slug);
  });
}

test("no component starts disagreeing with the capture more than it did", function () {
  const rises = unwaived(risesAgainst(BASE.bySlug || {}, fresh.bySlug, ACCEPTED_RISE));
  assert.deepEqual(
    rises.map(function (r) {
      return r.slug + " " + r.from + " -> " + r.to;
    }),
    [],
    "these components' CSS moved AWAY from the shape the capture measured. " +
      "Either the stylesheet regressed, or a Figma sync moved the capture and " +
      "the renderer has not followed. Fix the declaration, or add the slug to " +
      "ACCEPTED_RISE in this file with the reason it is right.",
  );
});

test("the total may fall, never rise, over the slugs both sides carry", function () {
  const t = comparableTotals(BASE.bySlug || {}, fresh.bySlug);
  const waived = risesAgainst(BASE.bySlug || {}, fresh.bySlug, ACCEPTED_RISE)
    .filter(function (r) {
      return reasonFor(r.slug);
    })
    .reduce(function (n, r) {
      return n + (r.to - r.from);
    }, 0);
  assert.ok(
    t.to <= t.from + waived,
    "geometry disagreements went " +
      t.from +
      " -> " +
      t.to +
      " across the components both revisions carry" +
      (waived ? " (" + waived + " of that is waived)" : "") +
      ". This number is the worklist and it only goes down.",
  );
});

test("a rise is reported, a fall is not, and a new slug is neither", function () {
  // The gate has to be shown failing on its own subject, or it is a check
  // nobody has seen work.
  const before = { a: { mismatch: 2 }, b: { mismatch: 5 } };
  const after = {
    a: { mismatch: 4 },
    b: { mismatch: 1 },
    c: { mismatch: 9 },
  };
  const rises = risesAgainst(before, after, {});
  assert.deepEqual(
    rises.map(function (r) {
      return r.slug;
    }),
    ["a"],
    "only the slug that rose",
  );
  assert.equal(rises[0].from, 2);
  assert.equal(rises[0].to, 4);
  // c is new: it has no baseline to rise against, and its 9 must not be read as
  // a rise from an imagined zero.
  const totals = comparableTotals(before, after);
  assert.deepEqual(totals, { from: 7, to: 5 });
});

test("a waiver with no reason waives nothing", function () {
  // `unwaived` is the function the gate actually calls, so it is the one under
  // test. A truthy-but-empty entry -- `true`, "", whitespace -- is the shape
  // that reads as an exemption and states nothing, and it must not pass.
  const rise = [{ slug: "a", from: 1, to: 3 }];
  const original = Object.assign({}, ACCEPTED_RISE);
  try {
    for (const value of ["", "   ", true, null, undefined, 1]) {
      ACCEPTED_RISE.a = value;
      assert.equal(
        unwaived(rise).length,
        1,
        "a waiver of " + JSON.stringify(value) + " must not wave a rise through",
      );
    }
    // And a real reason does waive, so the check above is not passing because
    // `unwaived` waives nothing at all.
    ACCEPTED_RISE.a = "the 2026-09-07 sync re-measured this frame";
    assert.equal(unwaived(rise).length, 0);
  } finally {
    delete ACCEPTED_RISE.a;
    Object.assign(ACCEPTED_RISE, original);
  }
});

test("every waiver names a slug that exists and carries a reason", function () {
  for (const slug of Object.keys(ACCEPTED_RISE)) {
    assert.ok(
      fresh.bySlug[slug],
      "ACCEPTED_RISE names " + slug + ", which the measurement does not have",
    );
    assert.ok(
      reasonFor(slug),
      "ACCEPTED_RISE[" + slug + "] has no reason, so it waives nothing and " +
        "should be deleted rather than left looking like an exemption",
    );
  }
});

test("the measurement covers every slug the renderer implements", function () {
  // A check that quietly measures a shrinking surface is the failure this
  // repo's gates keep rediscovering. Asserted per slug, not as a count.
  const missing = MATRIX.RENDER_SLUGS.filter(function (s) {
    return !fresh.bySlug[s];
  });
  assert.deepEqual(
    missing,
    [],
    "these slugs render but were not measured, so their geometry is unchecked " +
      "while the report still looks complete",
  );
});

test("the report's totals are the sum of what it published per slug", function () {
  // An internal-consistency check, so a future change to the aggregation cannot
  // publish a headline the detail does not support.
  const sum = { verified: 0, verifiedViaTokenName: 0, mismatch: 0, unverifiable: 0 };
  for (const row of Object.values(fresh.bySlug)) {
    sum.verified += row.verified;
    sum.verifiedViaTokenName += row.verifiedViaTokenName;
    sum.mismatch += row.mismatch;
    sum.unverifiable += row.unverifiable;
  }
  assert.equal(fresh.totals.verified, sum.verified);
  assert.equal(fresh.totals.verifiedViaTokenName, sum.verifiedViaTokenName);
  assert.equal(fresh.totals.mismatch, sum.mismatch);
  assert.equal(fresh.totals.unverifiable, sum.unverifiable);
  assert.equal(
    fresh.totals.examined,
    sum.verified + sum.verifiedViaTokenName + sum.mismatch + sum.unverifiable,
    "examined must be the whole of what was looked at, or the pair the trend " +
      "publishes is not a pair",
  );
  assert.equal(
    fresh.mismatches.length,
    fresh.totals.mismatch,
    "the detail list and the headline count must be the same set",
  );
});

test("every mismatch names its subject, both numbers, and where it lives", function () {
  // A finding a reader cannot act on is a number, not a finding.
  for (const m of fresh.mismatches) {
    assert.ok(fresh.bySlug[m.slug], "mismatch on an unmeasured slug: " + m.slug);
    assert.ok(m.selector, m.slug + " mismatch with no selector");
    assert.ok(m.property, m.slug + " mismatch with no property");
    assert.equal(typeof m.painted, "number", m.slug + " " + m.property + ": painted is not a number");
    assert.equal(typeof m.fact, "number", m.slug + " " + m.property + ": fact is not a number");
    assert.notEqual(m.painted, m.fact, "a mismatch whose two numbers agree is not a mismatch");
    assert.match(m.message, new RegExp(m.slug.replace(/[-]/g, "\\-")));
  }
});

test("the committed report matches a fresh measurement", function () {
  // The artifact ships to consumers by tag. A committed copy that disagrees
  // with what the code produces is a published number nobody can reproduce.
  const committed = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, D.OUT_REL), "utf8"),
  );
  assert.deepEqual(
    committed.totals,
    fresh.totals,
    "components/render/dist/geometry-report.json is stale. Run `npm run derive:render`.",
  );
  assert.deepEqual(committed.bySlug, fresh.bySlug);
});
