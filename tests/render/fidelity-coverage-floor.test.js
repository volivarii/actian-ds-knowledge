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

// Run the real CLI with its report relocated to a throwaway copy doctored to
// claim MORE checkable declarations than the current CSS can actually produce,
// which is exactly the shape of a real regression.
//
// The relocation is why `--report` exists. The obvious version of this test
// doctored the committed report in place, and that raced: `node --test` runs
// test FILES in parallel, so a sibling file's CLI subprocess read the doctored
// bytes and failed on a regression this file had planted. Relocating both the
// read and the write keeps the fixture private to this test.
//
// It stays a subprocess test on purpose. The pure-function tests above cannot
// catch the one ordering mistake that would make this whole gate useless:
// reading the previous report AFTER the run has already overwritten it. Then
// the baseline would always equal the new value and the gate would be a
// tautology. `--report` points the read and the write at the SAME path, so
// that ordering is still what is under test.
function withInflatedBaseline(extra, args) {
  var fixture = path.join(
    fs.mkdtempSync(path.join(require("node:os").tmpdir(), "fidelity-floor-")),
    "fidelity-report.json",
  );
  var doctored = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  doctored.totals.verified += extra;
  doctored.bySlug.badge.verified += extra;
  fs.writeFileSync(fixture, JSON.stringify(doctored, null, 2) + "\n");

  var argv = [CLI, "--report=" + fixture].concat(args || []);
  var res;
  try {
    res = {
      code: 0,
      out: execFileSync(process.execPath, argv, {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
      err: "",
    };
  } catch (e) {
    res = {
      code: e.status,
      out: String(e.stdout || ""),
      err: String(e.stderr || ""),
    };
  }
  res.fixture = fixture;
  res.rewritten = JSON.parse(fs.readFileSync(fixture, "utf8"));
  return res;
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
//     36 checkable / 394 examined =  9.1%   (tag-default 7 -> 0, tag-stage 7 -> 0)
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
      "tag-default": slug(7),
      "tag-stage": slug(7),
      badge: slug(1),
    },
  );
  var next = report(
    { verified: 2, verifiedViaTokenName: 0, mismatch: 0, examined: 90 },
    {
      "tag-default": slug(0, { blind: true }),
      "tag-stage": slug(1),
      badge: slug(1),
    },
  );

  var reg = F.coverageRegression(prev, next);
  assert.ok(reg, "expected a regression");
  assert.equal(reg.checkableFrom, 15);
  assert.equal(reg.checkableTo, 2);
  assert.deepEqual(reg.lost, [
    { slug: "tag-default", from: 7, to: 0 },
    { slug: "tag-stage", from: 7, to: 1 },
  ]);
});

test("coverageRegression: a slug the capture can no longer say anything about is reported as newly blind", function () {
  var prev = report(
    { verified: 8, verifiedViaTokenName: 0, mismatch: 0 },
    { "tag-default": slug(7), "tag-stage": slug(1, { blind: false }) },
  );
  var next = report(
    { verified: 1, verifiedViaTokenName: 0, mismatch: 0 },
    {
      "tag-default": slug(0, { blind: true }),
      "tag-stage": slug(1, { blind: false }),
    },
  );

  var reg = F.coverageRegression(prev, next);
  assert.deepEqual(reg.newlyBlind, ["tag-default"]);
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
      { slug: "tag-default", from: 7, to: 0 },
      { slug: "tag-stage", from: 7, to: 0 },
    ],
    newlyBlind: ["tag-default", "tag-stage"],
  });

  // Direction, in both units, because "coverage changed" is the advice that
  // launders a regression.
  assert.match(msg, /49/);
  assert.match(msg, /36/);
  assert.match(msg, /11\.8%/);
  assert.match(msg, /9\.1%/);
  // The subjects, so the reader does not have to diff two JSON files.
  assert.match(msg, /tag-default/);
  assert.match(msg, /tag-stage/);
  // The decision path, by name. A loss can be legitimate; it may not be
  // silent.
  assert.match(msg, /--accept-coverage-loss/);
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
  var r = withInflatedBaseline(5);
  assert.equal(r.code, 1, "expected the gate to block:\n" + r.err);
  assert.match(r.err, /ORACLE COVERAGE REGRESSED/);
  assert.match(r.err, /badge/);
});

test("CLI: the run overwrites the very report it compared against, so the read must have happened first", function () {
  // The anti-tautology assertion. The regression above was detected against a
  // baseline claiming badge had 5 extra verified declarations, and the file now
  // holds the true, lower number. If the read were moved after the write, the
  // baseline would have been these same true values and no regression could
  // ever be reported.
  var r = withInflatedBaseline(5);
  assert.equal(r.code, 1);
  assert.equal(
    r.rewritten.totals.verified,
    47,
    "the report should have been rewritten with the real count",
  );
});

test("CLI: --accept-coverage-loss with a stated reason lands the same run", function () {
  var r = withInflatedBaseline(5, [
    "--accept-coverage-loss=badge is being retired on purpose",
  ]);
  assert.equal(r.code, 0, "expected the stated reason to land it:\n" + r.err);
  assert.match(r.out, /badge is being retired on purpose/);
});

test("CLI: a bare --accept-coverage-loss still blocks, since it says nothing", function () {
  var r = withInflatedBaseline(5, ["--accept-coverage-loss"]);
  assert.equal(r.code, 1, "expected a reasonless flag to block");
});
