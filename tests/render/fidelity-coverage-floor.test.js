"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var execFileSync = require("node:child_process").execFileSync;
var F = require("../../scripts/render/fidelity-check.js");

var REPO_ROOT = path.resolve(__dirname, "../..");
var CLI = path.join(REPO_ROOT, "scripts", "render", "fidelity-check.js");
var REPORT = path.join(
  REPO_ROOT,
  "components",
  "render",
  "dist",
  "fidelity-report.json",
);

// Fixture helpers.
//
// `--report` relocates the baseline read AND the dist write to the same
// throwaway path. Both ends move together on purpose: the ordering that makes
// or breaks this gate is read-before-write on ONE path, so a fixture that
// separated them could not catch the mistake. Doctoring the committed report
// in place was the first version and it raced, because `node --test` runs test
// FILES in parallel and a sibling file`s CLI subprocess read the planted bytes.
//
// Nothing here pins a corpus fact. An earlier version hardcoded the verified
// count 47 and the slug `badge`, which is the same pinned-number anti-pattern
// this gate exists to remove: a Figma sync renaming that slug would have
// crashed the gate`s own tests with a TypeError instead of a diagnosis.
function checkableOf(row) {
  return (
    (row.verified || 0) + (row.verifiedViaTokenName || 0) + (row.mismatch || 0)
  );
}

function committedReport() {
  return JSON.parse(fs.readFileSync(REPORT, "utf8"));
}

// What the CURRENT corpus verifies, measured by running the gate into a
// throwaway report that has no baseline to compare against.
//
// This used to read `committedReport().totals.verified`, i.e. it took the
// committed dist as the oracle for what a fresh run should produce. That is
// backwards twice over: the artifact is an OUTPUT of the thing under test, so the
// assertion goes stale on every legitimate change (it failed 75 !== 47 the day
// the fold-in raised real coverage), and the obvious way to "fix" it is to
// regenerate the artifact -- which is exactly the laundering shape the gate this
// file guards exists to end. Measure, never remember.
function freshReport() {
  var dir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "fidelity-fresh-"),
  );
  var probe = path.join(dir, "fidelity-report.json");
  var r = runCli(["--report=" + probe]);
  assert.ok(
    fs.existsSync(probe),
    "the measuring run wrote no report, so there is no oracle to compare " +
      "against (a missing file must not read as a zero): " +
      r.out +
      r.err,
  );
  return JSON.parse(fs.readFileSync(probe, "utf8"));
}

function trueVerifiedCount() {
  return freshReport().totals.verified;
}

// The alphabetically first slug the capture can actually speak to. Derived, so
// a rename moves the specimen instead of breaking the test.
function specimenSlug(rep) {
  var s = Object.keys(rep.bySlug)
    .filter(function (k) {
      return checkableOf(rep.bySlug[k]) > 0;
    })
    .sort()[0];
  assert.ok(s, "the corpus has no verifiable slug to use as a specimen");
  return s;
}

// A baseline claiming MORE checkable declarations than the current CSS can
// produce, which is the shape of a real regression.
function inflatedFixture(extra) {
  var dir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "fidelity-floor-"),
  );
  var rep = committedReport();
  var s = specimenSlug(rep);
  rep.totals.verified += extra;
  rep.bySlug[s].verified += extra;
  var fixture = path.join(dir, "fidelity-report.json");
  fs.writeFileSync(fixture, JSON.stringify(rep, null, 2) + "\n");
  return fixture;
}

function runCli(args) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [CLI].concat(args || []), {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
      err: "",
    };
  } catch (e) {
    return {
      code: e.status,
      out: String(e.stdout || ""),
      err: String(e.stderr || ""),
    };
  }
}

// The gate this file covers exists because oracle coverage turned out to be
// ERODING and nothing said so. Measured 2026-08-11 from three committed
// fidelity-report.json snapshots:
//
//   v0.34.118 (2026-07-24, when the gate first examined all 63 renders)
//     65 checkable / 445 examined = 14.6%
//   main v0.34.122 (2026-08-11)
//     49 checkable / 415 examined = 11.8%
//   the held 2026-08-11 tag sync, if landed
//     36 checkable / 394 examined =  9.1%   (tag-read-only 7 -> 0, tag-stage 7 -> 0)
//
// `mismatch` was 0 at all three points, so the old gate was correct and silent:
// it only ever exits on a mismatch or a violation, so the capture's ability to
// check ANYTHING could fall to zero with CI green. That is the same false
// all-clear shape as a gate that never asserts its subject was present.
//
// WHY THE BLOCKING CONDITION IS THE ABSOLUTE CHECKABLE COUNT, NOT THE RATIO:
// the ratio moves for two very different reasons. Losing a declaration the
// capture used to confirm is unambiguously worse. Gaining a new component the
// capture is blind to also lowers the ratio while losing nothing at all, and
// gating on that would red an ordinary additive Figma sync every time a new
// component lands, which is how a gate becomes noise and then gets ignored.
// So the count blocks and the ratio is always reported for direction.

function report(totals, bySlug) {
  return { totals: totals, bySlug: bySlug || {} };
}

function slug(verified, opts) {
  var o = opts || {};
  return {
    verified: verified,
    verifiedViaTokenName: o.viaToken || 0,
    mismatch: o.mismatch || 0,
    unverifiable: o.unverifiable || 0,
    overridden: 0,
    blind: o.blind === true,
  };
}

test("coverageRegression: no regression when more declarations became checkable", function () {
  var prev = report({ verified: 10, verifiedViaTokenName: 0, mismatch: 0 });
  var next = report({ verified: 14, verifiedViaTokenName: 0, mismatch: 0 });
  assert.equal(F.coverageRegression(prev, next), null);
});

test("coverageRegression: no regression when the checkable count is unchanged", function () {
  var prev = report({ verified: 10, verifiedViaTokenName: 2, mismatch: 0 });
  var next = report({ verified: 12, verifiedViaTokenName: 0, mismatch: 0 });
  assert.equal(F.coverageRegression(prev, next), null);
});

test("coverageRegression: a fall in the checkable count is a regression, and it names the slugs that lost, worst first", function () {
  var prev = report(
    { verified: 15, verifiedViaTokenName: 0, mismatch: 0, examined: 100 },
    {
      "tag-read-only": slug(7),
      "tag-stage": slug(7),
      badge: slug(1),
    },
  );
  var next = report(
    { verified: 2, verifiedViaTokenName: 0, mismatch: 0, examined: 90 },
    {
      "tag-read-only": slug(0, { blind: true }),
      "tag-stage": slug(1),
      badge: slug(1),
    },
  );

  var reg = F.coverageRegression(prev, next);
  assert.ok(reg, "expected a regression");
  assert.equal(reg.checkableFrom, 15);
  assert.equal(reg.checkableTo, 2);
  assert.deepEqual(reg.lost, [
    { slug: "tag-read-only", from: 7, to: 0 },
    { slug: "tag-stage", from: 7, to: 1 },
  ]);
});

test("coverageRegression: a slug the capture can no longer say anything about is reported as newly blind", function () {
  var prev = report(
    { verified: 8, verifiedViaTokenName: 0, mismatch: 0 },
    { "tag-read-only": slug(7), "tag-stage": slug(1, { blind: false }) },
  );
  var next = report(
    { verified: 1, verifiedViaTokenName: 0, mismatch: 0 },
    {
      "tag-read-only": slug(0, { blind: true }),
      "tag-stage": slug(1, { blind: false }),
    },
  );

  var reg = F.coverageRegression(prev, next);
  assert.deepEqual(reg.newlyBlind, ["tag-read-only"]);
});

test("coverageRegression: a new blind component lowers the ratio without losing anything, and does NOT block", function () {
  // The additive-sync case. Nothing that was checkable stopped being
  // checkable; the denominator grew because a component the capture cannot
  // speak to arrived. Coverage falls, and that is worth PRINTING, never worth
  // failing an otherwise clean nightly sync on.
  var prev = report(
    { verified: 10, verifiedViaTokenName: 0, mismatch: 0, examined: 50 },
    { badge: slug(10, { unverifiable: 40 }) },
  );
  var next = report(
    { verified: 10, verifiedViaTokenName: 0, mismatch: 0, examined: 70 },
    {
      badge: slug(10, { unverifiable: 40 }),
      "brand-new-thing": slug(0, { unverifiable: 20, blind: true }),
    },
  );

  assert.equal(F.coverageRegression(prev, next), null);
});

test("coverageRegression: no previous report means nothing to compare, so it cannot regress", function () {
  var next = report({ verified: 3, verifiedViaTokenName: 0, mismatch: 0 });
  assert.equal(F.coverageRegression(null, next), null);
});

test("coverageFailureMessage: states the direction, the losing slugs, and names the escape hatch", function () {
  var msg = F.coverageFailureMessage({
    checkableFrom: 49,
    checkableTo: 36,
    coverageFrom: 0.1181,
    coverageTo: 0.0914,
    lost: [
      { slug: "tag-read-only", from: 7, to: 0 },
      { slug: "tag-stage", from: 7, to: 0 },
    ],
    newlyBlind: ["tag-read-only", "tag-stage"],
  });

  // Direction, in both units, because "coverage changed" is the advice that
  // launders a regression.
  assert.match(msg, /49/);
  assert.match(msg, /36/);
  assert.match(msg, /11\.8%/);
  assert.match(msg, /9\.1%/);
  // The subjects, so the reader does not have to diff two JSON files.
  assert.match(msg, /tag-read-only/);
  assert.match(msg, /tag-stage/);
  // The decision path, by name. A loss can be legitimate; it may not be
  // silent.
  assert.match(msg, /--accept-coverage-loss/);
});

// DIRECTION. The blocking condition is compound -- a per-slug loss OR a fall in
// the repo-wide total -- so the report of it has to be compound too, or it
// misstates one of the two facts.
//
// The 2026-08-12 tag fold-in made that concrete: three slugs lost their own
// coverage (renamed or retired) while the repo-wide count went 49 -> 78 and
// oracle coverage 11.8% -> 17.8%. Both messages announced "ORACLE COVERAGE
// REGRESSED: 49 -> 78 ... (11.8% -> 17.8%)" and "ACCEPTED COVERAGE LOSS: 49 ->
// 78", i.e. they described a 60% GAIN as a loss. That is the reporting half of
// the failure family this file exists for: a reader who is told "regressed"
// about an improvement learns to distrust the gate, and the next time it says
// "regressed" about a real regression, nobody believes it.
//
// So the two facts are pinned separately, in all three directions the total can
// move, for BOTH messages. The per-slug half must stay just as prominent and
// just as blocking whichever way the total went -- gating on the total was the
// exact hole #516 closed.
var DIRECTION_CASES = [
  {
    name: "total rose",
    from: 49,
    to: 78,
    coverageFrom: 0.1181,
    coverageTo: 0.178,
    expect: /\bROSE\b/,
    forbid: [/\bFELL\b/, /\bUNCHANGED\b/, /REGRESSED/],
  },
  {
    name: "total fell",
    from: 78,
    to: 49,
    coverageFrom: 0.178,
    coverageTo: 0.1181,
    expect: /\bFELL\b/,
    forbid: [/\bROSE\b/, /\bUNCHANGED\b/],
  },
  {
    name: "total level",
    from: 49,
    to: 49,
    coverageFrom: 0.1181,
    coverageTo: 0.1181,
    expect: /\bUNCHANGED\b/,
    forbid: [/\bROSE\b/, /\bFELL\b/],
  },
  {
    // The count can hold level while the ratio falls, because the denominator
    // grew. Two units, two directions, each stated on its own terms.
    name: "count level, ratio fell",
    from: 49,
    to: 49,
    coverageFrom: 0.1181,
    coverageTo: 0.0914,
    expect: /\bUNCHANGED\b/,
    expectAlso: /\bFELL\b/,
    forbid: [/\bROSE\b/],
  },
];

function regressionFor(c) {
  return {
    checkableFrom: c.from,
    checkableTo: c.to,
    coverageFrom: c.coverageFrom,
    coverageTo: c.coverageTo,
    lost: [
      { slug: "tag-stage", from: 7, to: 0 },
      { slug: "tag-glossary-item-type", from: 1, to: 0 },
    ],
    newlyBlind: ["tag-stage"],
  };
}

DIRECTION_CASES.forEach(function (c) {
  test(
    "coverageFailureMessage: states the per-slug loss AND the total's true direction (" +
      c.name +
      ")",
    function () {
      var msg = F.coverageFailureMessage(regressionFor(c));
      // Fact 1: which slugs got worse, still named, still stated as blocking.
      assert.match(msg, /tag-stage: 7 -> 0/);
      assert.match(msg, /tag-glossary-item-type: 1 -> 0/);
      assert.match(
        msg,
        /block/i,
        "the per-slug loss must say it blocks, whichever way the total moved: " +
          msg,
      );
      // Fact 2: the total's direction, in its own terms, truthfully.
      assert.match(
        msg,
        c.expect,
        "the total went " + c.name + ", so the message must say so: " + msg,
      );
      if (c.expectAlso) assert.match(msg, c.expectAlso);
      c.forbid.forEach(function (bad) {
        assert.doesNotMatch(
          msg,
          bad,
          "the message states a direction the numbers contradict (" +
            c.name +
            "): " +
            msg,
        );
      });
      // Both counts are present, so nobody has to subtract to learn the delta.
      assert.match(msg, new RegExp("\\b" + c.from + "\\b"));
      assert.match(msg, new RegExp("\\b" + c.to + "\\b"));
    },
  );

  test(
    "acceptedLossMessage: records the per-slug loss it waived AND the total's true direction (" +
      c.name +
      ")",
    function () {
      var msg = F.acceptedLossMessage(
        regressionFor(c),
        "the tag fold-in renamed these slugs",
      );
      assert.match(
        msg,
        /tag-stage: 7 -> 0/,
        "the waived subject must be named",
      );
      assert.match(msg, /the tag fold-in renamed these slugs/);
      assert.match(
        msg,
        c.expect,
        "the CI log line must state the total's real direction: " + msg,
      );
      if (c.expectAlso) assert.match(msg, c.expectAlso);
      c.forbid.forEach(function (bad) {
        assert.doesNotMatch(
          msg,
          bad,
          "wrong direction (" + c.name + "): " + msg,
        );
      });
    },
  );
});

test("acceptedCoverageLoss: returns the stated reason so the run can record why the loss was allowed", function () {
  var reason = F.acceptedCoverageLoss([
    "node",
    "fidelity-check.js",
    "--accept-coverage-loss=the tag Type migration retires the bordered treatment the oracle read",
  ]);
  assert.equal(
    reason,
    "the tag Type migration retires the bordered treatment the oracle read",
  );
});

test("acceptedCoverageLoss: the bare flag with no reason does NOT accept anything", function () {
  // A flag that waves the gate through without saying why is the silent pass
  // this gate exists to remove. An empty reason must read as "not accepted".
  assert.equal(
    F.acceptedCoverageLoss([
      "node",
      "fidelity-check.js",
      "--accept-coverage-loss",
    ]),
    null,
  );
  assert.equal(
    F.acceptedCoverageLoss([
      "node",
      "fidelity-check.js",
      "--accept-coverage-loss=",
    ]),
    null,
  );
  assert.equal(F.acceptedCoverageLoss(["node", "fidelity-check.js"]), null);
});

test("reportPathOverride: no flag means the CLI uses its own dist path", function () {
  assert.equal(F.reportPathOverride(["node", "fidelity-check.js"]), null);
});

test("reportPathOverride: --report relocates the report, so a test can supply its own baseline", function () {
  assert.equal(
    F.reportPathOverride([
      "node",
      "fidelity-check.js",
      "--report=/tmp/x/fidelity-report.json",
    ]),
    "/tmp/x/fidelity-report.json",
  );
});

test("CLI: a coverage loss against the committed report blocks the build and names the slug", function () {
  var fixture = inflatedFixture(5);
  var specimen = specimenSlug(committedReport());
  var r = runCli(["--report=" + fixture]);
  assert.equal(r.code, 1, "expected the gate to block:\n" + r.err);
  // Wording updated with the direction split: this asserted
  // /ORACLE COVERAGE REGRESSED/, a single headline built from the TOTALS, which
  // is the line that announced a 60% gain as a regression on the tag fold-in.
  // Both facts are asserted here instead, each in its own section.
  assert.match(r.err, /PER-SLUG COVERAGE LOSS/, r.err);
  assert.match(r.err, new RegExp(specimen));
  assert.match(r.err, /REPO-WIDE TOTAL/, r.err);
  assert.match(
    r.err,
    /checkable color declarations (ROSE|FELL|UNCHANGED)/,
    "the total's direction must be stated in its own terms: " + r.err,
  );
});

test("CLI: a bare --accept-coverage-loss still blocks, since it says nothing", function () {
  var fixture = inflatedFixture(5);
  var r = runCli(["--report=" + fixture, "--accept-coverage-loss"]);
  assert.equal(r.code, 1, "expected a reasonless flag to block");
  assert.match(
    r.err,
    /without a reason/i,
    "a flag that was seen and rejected must say so, not reprint the same wall of text",
  );
});

// ---------------------------------------------------------------------------
// Review findings, 2026-08-11. Every test below was added because an
// independent review pass found the first version of this gate could be
// defeated. They are the anti-laundering half of the gate.
// ---------------------------------------------------------------------------

test("coverageRegression: a per-slug loss blocks even when a gain elsewhere keeps the total level", function () {
  // The first version compared only the repo-wide total and returned before
  // the per-slug loop, so the exact erosion shape it was built for passed
  // whenever anything else improved in the same change.
  var prev = report(
    { verified: 14, verifiedViaTokenName: 0, mismatch: 0, examined: 100 },
    { "tag-read-only": slug(7), badge: slug(7) },
  );
  var next = report(
    { verified: 14, verifiedViaTokenName: 0, mismatch: 0, examined: 100 },
    { "tag-read-only": slug(0, { blind: true }), badge: slug(14) },
  );

  var reg = F.coverageRegression(prev, next);
  assert.ok(reg, "a slug going fully blind must block regardless of the total");
  assert.deepEqual(reg.lost, [{ slug: "tag-read-only", from: 7, to: 0 }]);
  assert.deepEqual(reg.newlyBlind, ["tag-read-only"]);
});

test("coverageRegression: a baseline with no oracleCoverage field still reports a real ratio", function () {
  // pct(undefined) rendered 0.0%, so the headline read "0.0% -> 9.1%", which
  // a reader parses as a GAIN on a run that is blocking them for a loss.
  var prev = report({
    verified: 10,
    verifiedViaTokenName: 0,
    mismatch: 0,
    examined: 100,
  });
  var next = report({
    verified: 5,
    verifiedViaTokenName: 0,
    mismatch: 0,
    examined: 100,
  });
  var reg = F.coverageRegression(prev, next);
  assert.equal(reg.coverageFrom, 0.1);
  assert.equal(reg.coverageTo, 0.05);
});

test("acceptedCoverageLoss: the space-separated form is honoured too", function () {
  assert.equal(
    F.acceptedCoverageLoss([
      "node",
      "x.js",
      "--accept-coverage-loss",
      "the tag Type migration retires the bordered treatment",
    ]),
    "the tag Type migration retires the bordered treatment",
  );
});

test("acceptedCoverageLoss: a flag followed by another flag is still no reason", function () {
  assert.equal(
    F.acceptedCoverageLoss([
      "node",
      "x.js",
      "--accept-coverage-loss",
      "--report=/tmp/x",
    ]),
    null,
  );
});

test("CLI: a failing run does NOT overwrite the baseline it compared against", function () {
  // The finding that mattered most. The first version wrote the new report
  // before evaluating the regression, so the gate could fail at most once per
  // checkout: re-running, or simply committing the regenerated dist, reported
  // green with nothing fixed. That is the laundering path this gate exists to
  // close, reopened by the gate itself.
  var fixture = inflatedFixture(5);
  var first = runCli(["--report=" + fixture]);
  assert.equal(first.code, 1, "expected the first run to block:\n" + first.err);

  var second = runCli(["--report=" + fixture]);
  assert.equal(
    second.code,
    1,
    "a second run with nothing changed must STILL block; if it passes, the " +
      "failing run destroyed its own baseline:\n" +
      second.out,
  );
});

test("CLI: an accepted loss DOES write the report, since that is how the loss is landed", function () {
  var fixture = inflatedFixture(5);
  var r = runCli([
    "--report=" + fixture,
    "--accept-coverage-loss=badge is being retired on purpose",
  ]);
  assert.equal(r.code, 0, r.err);
  var written = JSON.parse(fs.readFileSync(fixture, "utf8"));
  assert.equal(
    written.totals.verified,
    trueVerifiedCount(),
    "the accepted run must leave the real measurement behind as the new baseline",
  );
});

test("CLI: an unparseable baseline blocks instead of silently skipping the comparison", function () {
  // A corrupt report used to turn the gate back into the silent pass it was
  // added to remove, with no output saying no comparison had happened.
  var dir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "fid-corrupt-"),
  );
  var fixture = path.join(dir, "fidelity-report.json");
  fs.writeFileSync(fixture, '{"totals": {"verified": 4');
  var r = runCli(["--report=" + fixture]);
  assert.equal(r.code, 1, "a corrupt baseline must not pass silently");
  assert.match(r.err, /could not be read|unparseable|corrupt/i);
});

test("CLI: a fixture run says so, so a log can never be mistaken for a real one", function () {
  var fixture = inflatedFixture(0);
  var r = runCli(["--report=" + fixture]);
  assert.match(
    r.out + r.err,
    /FIXTURE/,
    "--report relocates the tracked artifact, which must be loud",
  );
});
