"use strict";

// Gate: the quality-trend roll-up reports the SAME figures the gates compute.
//
// Why this test is the first one: the roll-up's whole purpose is to be quotable,
// and the failure mode of a quotable number in this repo is a consumer restating
// a fact the producer owns. A naive re-count of the contract's `rendersAs` keys
// returns 106 where the gate reports 61, because it knows nothing about
// State-axis exclusion or equivalence classes. So the roll-up must CALL the
// gate's helper, and this asserts the join rather than the value.

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const collapse = require(
  path.join(REPO_ROOT, "scripts", "render", "lib", "variant-collapse.js"),
);
const BY_DESIGN = require(
  path.join(
    REPO_ROOT,
    "scripts",
    "render",
    "lib",
    "variant-collapse-by-design.js",
  ),
);
const { deriveContract } = require(
  path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
);
const trend = require(
  path.join(REPO_ROOT, "scripts", "render", "derive-quality-trend.js"),
);

// Built ONCE. Each build shells out to git per revision and re-derives the
// contract, so rebuilding per test cost ~1.5s a time and made this file half
// the suite's runtime. The roll-up is a pure function of the tree, so one build
// is as honest as eight.
let ROLLUP = null;
function rollupOnce() {
  if (!ROLLUP) ROLLUP = trend.buildRollup();
  return ROLLUP;
}

test("the roll-up's collapse figure is the gate's own classification", function () {
  const gateFigure = collapse.classify(deriveContract(), BY_DESIGN).unexplained
    .length;
  const measures = trend.currentMeasures();

  assert.strictEqual(
    measures.unexplainedCollapses.value,
    gateFigure,
    "the roll-up must report the gate's unexplained count, not its own",
  );
});

test("oracle coverage is carried as numerator and denominator, not a ratio", function () {
  // The single percentage is exactly what hid three weeks of a flat numerator
  // behind a shrinking denominator: 17.81% (75 of 438) to 19.12% (75 of 408)
  // with nothing more verified. A reader given only the ratio reads progress.
  const report = require(
    path.join(REPO_ROOT, "components", "render", "dist", "fidelity-report.json"),
  );
  const measures = trend.currentMeasures();
  const oracle = measures.oracleCoverage;

  assert.strictEqual(
    oracle.verified,
    report.totals.verified + report.totals.verifiedViaTokenName,
    "numerator must be the producer's verified count",
  );
  assert.strictEqual(
    oracle.examined,
    report.totals.examined,
    "denominator must be the producer's examined count",
  );
});

test("inline hex counts theming and ignores artwork", function () {
  // The distinction is the measure. A hex in a style attribute cannot re-theme
  // and is a defect; a hex inside <svg> is a drawing instruction and is
  // correct. Counting them together produced a number nobody could act on
  // (31 theming against 160 artwork today).
  const fragment = [
    '<div style="color:#ff0000">themed</div>',
    '<svg viewBox="0 0 2 2"><path fill="#00ff00"/><rect fill="#0000ff"/></svg>',
    '<span style="border:1px solid #abc">themed</span>',
  ].join("");

  assert.strictEqual(
    trend.countInlineHex(fragment),
    2,
    "two style-attribute hexes counted, three svg fills ignored",
  );
});

test("inline hex ignores a style attribute that is inside an svg", function () {
  // An svg can carry styled children. Those are still artwork: the fragment
  // author cannot token them and the renderer does not intend to.
  const fragment = '<svg><g style="fill:#123456"/></svg>';

  assert.strictEqual(
    trend.countInlineHex(fragment),
    0,
    "a style inside svg is artwork, not theming",
  );
});

test("direction knows which way is better for each measure", function () {
  // A ratchet only ever asks "did it rise". A burndown has to know that fewer
  // unexplained collapses is progress while fewer VERIFIED declarations is not,
  // or it reports attrition as improvement, which is the exact error the oracle
  // ratio has been making since 2026-08-12.
  assert.strictEqual(trend.direction("unexplainedCollapses", 50, 54), "better");
  assert.strictEqual(trend.direction("unexplainedCollapses", 54, 50), "worse");
  assert.strictEqual(trend.direction("inlineHex", 28, 31), "better");
  assert.strictEqual(trend.direction("oracleVerified", 80, 75), "better");
  assert.strictEqual(trend.direction("oracleVerified", 75, 80), "worse");
});

test("direction reports an unchanged measure as unchanged, not as progress", function () {
  // The flat numerator is the finding this artifact exists to surface: verified
  // has not moved since 2026-08-12 while the ratio rose. "unchanged" must be
  // its own answer, distinct from "better".
  assert.strictEqual(trend.direction("oracleVerified", 75, 75), "unchanged");
  assert.strictEqual(trend.direction("unexplainedCollapses", 54, 54), "unchanged");
});

test("the series is non-empty and every point is dated and versioned", function () {
  // Non-vacuity first: a series builder that silently returns [] would make
  // every direction "unknown" and the whole artifact green and useless.
  // Then the rule itself: a reported number must be DERIVED and DATED.
  const series = trend.oracleSeries({ limit: 4 });

  assert.ok(series.length > 0, "the series must not be empty");
  for (const point of series) {
    assert.match(
      point.date,
      /^\d{4}-\d{2}-\d{2}$/,
      "each point carries an ISO date, got: " + JSON.stringify(point),
    );
    assert.match(
      point.version,
      /^\d+\.\d+\.\d+$/,
      "each point carries the version it was measured at, got: " +
        JSON.stringify(point),
    );
    assert.strictEqual(
      typeof point.verified,
      "number",
      "each point carries the numerator",
    );
    assert.strictEqual(
      typeof point.examined,
      "number",
      "each point carries the denominator",
    );
  }
});

test("the series is ordered newest first", function () {
  const series = trend.oracleSeries({ limit: 4 });
  if (series.length < 2) return; // nothing to order
  for (let i = 1; i < series.length; i++) {
    assert.ok(
      series[i - 1].date >= series[i].date,
      "point " + i + " is out of order: " + series[i - 1].date + " then " + series[i].date,
    );
  }
});

test("the roll-up is dated, versioned, and carries a direction per measure", function () {
  // The finding this artifact exists for: 0 of the 14 metrics in
  // graph/dist/quality-report.json carry a non-null timestamp, and
  // fidelity-report._meta has no date and no version at all. A number without a
  // date is not reportable.
  const rollup = rollupOnce();

  assert.match(
    rollup._meta.sourcesLastChangedAt,
    /^\d{4}-\d{2}-\d{2}$/,
    "the roll-up is dated",
  );
  // No version stamp. package.json is read during the derive and
  // render-derive.yml bumps it AFTER, committing both together, so the file
  // released as v0.34.166 would state v0.34.165. Worse, the series points read
  // package.json at each commit, i.e. POST-bump, so a header version and a
  // series version would be two different conventions side by side. The date
  // and the series carry the identity instead.
  assert.ok(
    !("version" in rollup._meta),
    "no header version: it would always be one bump behind the tag it ships under",
  );
  assert.ok(rollup._meta.auto_generated, "stamped as generated");

  for (const name of ["unexplainedCollapses", "inlineHex", "oracleVerified", "fmUnexplainedCollapses", "fmUnownedModifiers"]) {
    const m = rollup.measures[name];
    assert.ok(m, name + " is present");
    assert.strictEqual(typeof m.value, "number", name + " has a value");
    assert.ok(
      ["better", "worse", "unchanged", "unknown", "changed"].includes(
        m.direction,
      ),
      name + " carries a direction, got: " + m.direction,
    );
  }
});

test("the roll-up reports the oracle numerator and denominator apart", function () {
  const rollup = rollupOnce();
  assert.strictEqual(
    rollup.measures.oracleVerified.value,
    trend.currentMeasures().oracleCoverage.verified,
  );
  assert.strictEqual(
    rollup.measures.oracleExamined.value,
    trend.currentMeasures().oracleCoverage.examined,
  );
  assert.ok(
    !("oracleCoverage" in rollup.measures),
    "the ratio is deliberately NOT a measure: it improves when the denominator shrinks",
  );
});

test("the markdown summary states the date and every measure's direction", function () {
  // Reporting today is a screenshot: nothing in the substrate exports. This is
  // the pasteable artifact, so the date has to be IN it, not implied by when
  // someone happened to open the file.
  const md = trend.renderMarkdown(rollupOnce());

  // VISIBLE, not an HTML comment. This artifact exists to be pasted into a
  // report, and a comment banner vanishes on render: the reader then has no way
  // to know the numbers are generated or that hand edits are overwritten. The
  // sibling coverage.md states it in a blockquote for the same reason.
  const firstLines = md.split("\n").slice(0, 6).join("\n");
  assert.match(
    firstLines,
    /^> .*[Aa]uto-generated/m,
    "the banner is visible when rendered, got: " + JSON.stringify(firstLines),
  );
  assert.match(md, /\d{4}-\d{2}-\d{2}/, "states the date it was measured");
  assert.match(md, /unexplained variant collapses/i);
  assert.match(md, /verified declarations/i);
  assert.match(md, /inline-style hex/i);
});

test("the markdown reports the oracle pair, never a bare percentage", function () {
  // A bare percentage is the one form this measure must not be published in:
  // it rose from 17.81% to 19.12% while nothing more became verifiable.
  const md = trend.renderMarkdown(rollupOnce());
  const rollup = rollupOnce();

  assert.match(
    md,
    new RegExp(
      rollup.measures.oracleVerified.value +
        "\\s*(of|/)\\s*" +
        rollup.measures.oracleExamined.value,
    ),
    "the pair is printed together so attrition is legible",
  );
});

test("the markdown shows the dated series, not only the latest delta", function () {
  // Comparing against the immediately previous commit tells a misleading story:
  // verified reads "improving (was 77)" when it has been 78 since 2026-08-12
  // and 77 was a single transient dip. The arc has to be visible or the reader
  // draws the same wrong conclusion the bare ratio produced.
  const rollup = rollupOnce();
  const md = trend.renderMarkdown(rollup);
  const oldest = rollup.oracleSeries[rollup.oracleSeries.length - 1];

  assert.match(
    md,
    new RegExp(oldest.date),
    "the oldest point in the window is printed, so the arc is visible",
  );
  assert.match(
    md,
    new RegExp("\\b" + oldest.verified + "\\b"),
    "with its value",
  );
});

test("the roll-up is byte-stable when its inputs have not changed", function () {
  // A generated artifact that embeds the wall clock changes every day whether
  // or not anything it measures did. That churns the derive's "did the dist
  // change" gate into always-true, so every PR takes a version bump for nothing
  // and the drift guard stops meaning anything. The date must come from the
  // measurement's source, not from now.
  const first = trend.renderMarkdown(rollupOnce());
  const second = trend.renderMarkdown(rollupOnce());
  assert.strictEqual(first, second, "two runs agree");

  const rollup = rollupOnce();
  assert.ok(
    rollup._meta.sourcesLastChangedAt >= rollup.oracleSeries[0].date,
    "the date is a source revision's, not today's wall clock",
  );
});

test("the oracle reader reads the file, so it cannot serve a cached copy", function () {
  // require() memoises. This script runs LAST in the derive chain, right after
  // fidelity-check.js rewrites the report it reads, so a cached read is exactly
  // the stale number this artifact exists to prevent anyone quoting.
  const fs = require("node:fs");
  const os = require("node:os");
  const tmp = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "qt-")),
    "fidelity-report.json",
  );

  fs.writeFileSync(
    tmp,
    JSON.stringify({ totals: { verified: 1, verifiedViaTokenName: 0, examined: 10 } }),
  );
  assert.deepStrictEqual(trend.readOracle(tmp), { verified: 1, examined: 10 });

  // Same path, new content, same process.
  fs.writeFileSync(
    tmp,
    JSON.stringify({ totals: { verified: 4, verifiedViaTokenName: 1, examined: 10 } }),
  );
  assert.deepStrictEqual(
    trend.readOracle(tmp),
    { verified: 5, examined: 10 },
    "a second read must see the rewritten file",
  );
});

test("every measure can carry a direction, not just the oracle", function () {
  // The artifact's promise is that each measure carries a direction. Leaving
  // collapses and hex permanently at "no baseline yet" delivers half of that,
  // and they are the two measures a person would act on first. Both sources
  // (render-contract.json, fragments/) are committed, so the baseline exists.
  const series = trend.collapseSeries({ limit: 4 });
  assert.ok(series.length > 0, "the collapse series must not be empty");
  for (const point of series) {
    assert.match(point.date, /^\d{4}-\d{2}-\d{2}$/, "dated");
    assert.strictEqual(typeof point.unexplained, "number", "carries the figure");
  }
});

test("the historical collapse figure uses the gate's classifier too", function () {
  // Same join as the current figure: a historical point computed by a second
  // method would make the trend disagree with the gate at every older point.
  //
  // 🪤 Compared against the blob AT THAT REVISION, never against the working
  // tree. render-derive.yml regenerates the dist and THEN runs the suite, so a
  // working-tree comparison fails on every run that actually changes the
  // contract, and it fails BEFORE the commit step, so the regenerated dist can
  // never land: the derive deadlocks with no path forward.
  const { execFileSync } = require("node:child_process");
  const series = trend.collapseSeries({ limit: 1 });
  const atRevision = JSON.parse(
    execFileSync(
      "git",
      [
        "show",
        series[0].sha + ":components/render/dist/render-contract.json",
      ],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 1 << 28 },
    ),
  );

  assert.strictEqual(
    series[0].unexplained,
    collapse.classify(atRevision, BY_DESIGN).unexplained.length,
    "the newest point equals the gate's classification of that same revision",
  );
});

test("previous is the newest committed value the BASELINE can see, not series[1]", function () {
  // The derive regenerates the dist and THEN this runs, so `current` is not yet
  // in the series: the newest point the baseline can see is the last committed
  // measurement. Taking series[1] skips a revision and misreports the direction
  // outright. With the real history 43 -> 65 -> 54, a fresh 54 against
  // series[1]=43 reads "worse" when the measure improved 65 -> 54, which is the
  // exact failure this artifact exists to prevent.
  const oracle = [
    { sha: "cccccccc", verified: 78, examined: 408 },
    { sha: "bbbbbbbb", verified: 77, examined: 408 },
  ];
  const collapses = [{ sha: "cccccccc", unexplained: 65 }, { sha: "bbbbbbbb", unexplained: 43 }];

  const prev = trend.previousValues(oracle, collapses, {
    oracle: ["cccccccc", "bbbbbbbb"],
    collapses: ["cccccccc", "bbbbbbbb"],
  });

  assert.strictEqual(prev.oracleVerified, 78, "the last committed verified");
  assert.strictEqual(prev.unexplainedCollapses, 65, "the last committed collapses");
});

test("previous skips a revision the merge base cannot see, which is this run's own output", function () {
  // #634. `render-derive.yml` triggers on paths-manifest.json and its own
  // auto-commit bumps it, so the workflow re-fires with the BOT'S COMMIT as
  // HEAD. Reading "the last commit that touched the artifact" then hands the
  // run its own freshly written value back: a figure that moved 65 -> 54
  // reports `unchanged (was 54)`, the artifact differs again, and a second
  // version bump ships for nothing.
  //
  // `bot00000` is that commit: newest in the series, absent from the merge
  // base. The honest previous is the value on main.
  const oracle = [
    { sha: "bot00000", verified: 54, examined: 408 },
    { sha: "main0000", verified: 65, examined: 408 },
  ];
  const collapses = [
    { sha: "bot00000", unexplained: 54 },
    { sha: "main0000", unexplained: 65 },
  ];
  const baseline = { oracle: ["main0000"], collapses: ["main0000"] };

  const prev = trend.previousValues(oracle, collapses, baseline);

  assert.strictEqual(
    prev.oracleVerified,
    65,
    "previous came from the bot's own commit, so the move reports as unchanged",
  );
  assert.strictEqual(
    prev.unexplainedCollapses,
    65,
    "previous came from the bot's own commit, so the move reports as unchanged",
  );
  assert.strictEqual(
    trend.direction("unexplainedCollapses", 54, prev.unexplainedCollapses),
    "better",
    "the direction a run that improved the figure must report",
  );
});

test("previousValues refuses to run without a baseline, rather than defaulting to the newest commit", function () {
  // The structural half. Selecting correctly is worthless if a caller can drop
  // the argument and get series[0] back, so the dangerous call is made
  // impossible instead of merely wrong: this is what goes red if buildRollup
  // ever reverts to previousValues(series, collapses).
  const oracle = [{ sha: "bot00000", verified: 54, examined: 408 }];
  const collapses = [{ sha: "bot00000", unexplained: 54 }];

  assert.throws(
    function () {
      trend.previousValues(oracle, collapses);
    },
    /needs the baseline revisions/,
    "a missing baseline must name itself, not silently mean HEAD",
  );
  assert.throws(
    function () {
      trend.previousValues(oracle, collapses, { oracle: ["main0000"] });
    },
    /needs the baseline revisions/,
    "half a baseline is not a baseline",
  );
});

test("firstAtOrBefore returns null when the baseline sees none of the series", function () {
  // A long-lived branch can push more revisions of one artifact than the series
  // holds. "no baseline yet" is honest; a fabricated comparison is not.
  assert.strictEqual(
    trend.firstAtOrBefore([{ sha: "bot00000" }], ["main0000"]),
    null,
  );
  assert.strictEqual(trend.firstAtOrBefore([], ["main0000"]), null);
});

test("baselineShas reads the merge base, so a commit pushed onto the branch is not in it", function () {
  // The wiring half, proved rather than asserted. The join test below compares
  // two reads that COINCIDE on any branch which has pushed no artifact commit,
  // so on a clean tree it cannot fail. This one builds the tree where they
  // differ: `main` holds one revision of the artifact, the branch holds a
  // second, and that second is exactly what render-derive's own auto-commit
  // adds before the workflow re-fires on it (#634).
  const fs = require("node:fs");
  const os = require("node:os");
  const { execFileSync } = require("node:child_process");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "qt-baseline-"));
  const g = function (...args) {
    return execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  };
  const REL = "artifact.json";
  const write = function (value) {
    fs.writeFileSync(path.join(repo, REL), JSON.stringify({ value: value }));
  };

  try {
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@example.invalid");
    g("config", "user.name", "t");
    write(65);
    g("add", REL);
    g("commit", "-q", "-m", "main: the value this run must compare against");
    const onMain = g("rev-parse", "HEAD");
    // `baselineRef` resolves origin/main; a bare temp repo has no remote, so
    // point the ref at the commit rather than cloning.
    g("update-ref", "refs/remotes/origin/main", onMain);

    g("checkout", "-q", "-b", "feature");
    write(54);
    g("commit", "-q", "-am", "the bot's own regenerate commit, pushed onto the PR");
    const onBranch = g("rev-parse", "HEAD");

    assert.notStrictEqual(onBranch, onMain, "the branch must have moved");
    assert.strictEqual(
      trend.baselineRef(repo),
      onMain,
      "the baseline is the merge base with main, not the branch tip",
    );

    const shas = trend.baselineShas(REL, 24, repo);
    assert.deepStrictEqual(
      shas,
      [onMain.slice(0, 8)],
      "the baseline sees main's revision only",
    );
    assert.ok(
      !shas.includes(onBranch.slice(0, 8)),
      "the run's own output is in the baseline, so every change reports unchanged",
    );

    // And the selection on top of it: HEAD's newest point is the bot's 54, the
    // honest previous is main's 65.
    const series = [
      { sha: onBranch.slice(0, 8), unexplained: 54 },
      { sha: onMain.slice(0, 8), unexplained: 65 },
    ];
    assert.strictEqual(trend.firstAtOrBefore(series, shas).unexplained, 65);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("the roll-up's DS baselines are the ones the merge base can see", function () {
  // The join. The two tests above pin the selection and the refusal on literal
  // data; this one pins the WIRING, that buildRollup hands previousValues the
  // merge base's revisions of the fidelity report and the contract rather than
  // HEAD's.
  const rollup = rollupOnce();
  const base = trend.dsBaselines();
  const expectedOracle = trend.firstAtOrBefore(rollup.oracleSeries, base.oracle);
  const expectedCollapse = trend.firstAtOrBefore(
    rollup.collapseSeries,
    base.collapses,
  );

  assert.strictEqual(
    rollup.measures.oracleVerified.previous,
    expectedOracle ? expectedOracle.verified : null,
  );
  assert.strictEqual(
    rollup.measures.oracleExamined.previous,
    expectedOracle ? expectedOracle.examined : null,
  );
  assert.strictEqual(
    rollup.measures.unexplainedCollapses.previous,
    expectedCollapse ? expectedCollapse.unexplained : null,
  );
  // And the baseline is a real ref, not the empty string that would make
  // `git log ""` mean HEAD.
  const ref = trend.baselineRef();
  assert.ok(
    typeof ref === "string" && ref.length > 0,
    "a baseline ref is named",
  );
});

test("inline hex counts a single-quoted style attribute too", function () {
  // No fragment uses single quotes today, so this is a false-clean waiting on a
  // renderer change rather than a wrong number now. A measure that silently
  // misses a case reads as progress when the renderer starts emitting it.
  assert.strictEqual(
    trend.countInlineHex("<div style='color:#ff0000'>x</div>"),
    1,
    "a single-quoted style attribute is still theming",
  );
});

test("the series refuses to publish an empty history rather than reporting null", function () {
  // In a shallow clone `git log` succeeds with zero matching commits, so the
  // series comes back empty and the markdown would publish "Measured at null"
  // with every direction "no baseline yet", silently. Absence must be loud.
  assert.throws(
    function () {
      trend.assertSeries([], "oracle");
    },
    /empty/i,
    "an empty series names itself rather than being published",
  );
  assert.doesNotThrow(function () {
    trend.assertSeries([{ date: "2026-01-01" }], "oracle");
  });
});

test("the date covers every source consulted, not just the oracle's", function () {
  // measuredAt was the newest fidelity-report revision alone, which has no
  // relationship to the collapse or hex figures at all, yet the table presented
  // it as covering the whole thing. It is now the newest revision of ANY source
  // read, which is both honest and still byte-stable.
  const rollup = rollupOnce();
  const oracleNewest = rollup.oracleSeries[0].date;
  const collapseNewest = rollup.collapseSeries[0].date;
  // The FM tier's sources (fm-base.css, the FM renderer, fmkit.json) are read
  // too, and moved a figure on a day neither of the other two files changed.
  const fmNewest = trend.fmSourcesDate();
  const expected = [oracleNewest, collapseNewest, fmNewest].sort().pop();

  assert.strictEqual(rollup._meta.sourcesLastChangedAt, expected);
  assert.match(rollup._meta.sourcesLastChangedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("the markdown shows the collapse arc too, not just the oracle's", function () {
  // The oracle table exists because a single-step delta misled. The collapse
  // figure swings harder in real history (43 -> 65 -> 54 across three weeks)
  // and is the measure a reader would act on FIRST, so showing it only as
  // "flat (was 54)" reproduces the same defect for the worse case.
  const rollup = rollupOnce();
  const md = trend.renderMarkdown(rollup);
  const oldest = rollup.collapseSeries[rollup.collapseSeries.length - 1];

  assert.match(md, /unexplained collapses over time/i, "the arc is printed");
  assert.match(
    md,
    new RegExp(oldest.date),
    "including the oldest point in the window",
  );
});

// The FM tier joins the roll-up the same way the DS tier did: the figure is
// the DS classifier's own verdict over the FM census, never a re-count.
const fmCollapse = require(
  path.join(REPO_ROOT, "scripts", "render", "lib", "fm-collapse.js"),
);
const FM_BY_DESIGN = require(
  path.join(REPO_ROOT, "scripts", "render", "lib", "fm-collapse-by-design.js"),
);

test("the roll-up's FM figures are the census's own, through the shared classifier", function () {
  const rollup = rollupOnce();
  const c = fmCollapse.census();
  assert.strictEqual(
    rollup.measures.fmUnexplainedCollapses.value,
    collapse.classify(c.contract, FM_BY_DESIGN).unexplained.length,
  );
  assert.strictEqual(rollup.measures.fmUnownedModifiers.value, c.unownedModifiers.length);
  assert.deepEqual(rollup.detail.fmUnownedModifiers.map((u) => u.class), c.unownedModifiers.map((u) => u.class));
});

test("direction knows fewer FM collapses and fewer unowned modifiers are progress", function () {
  assert.strictEqual(trend.direction("fmUnexplainedCollapses", 30, 35), "better");
  assert.strictEqual(trend.direction("fmUnownedModifiers", 60, 50), "worse");
});

test("previousValues carries every baseline from the merge base, not from this run's own write", function () {
  const prev = trend.previousValues(
    trend.oracleSeries({ limit: 2 }),
    trend.collapseSeries({ limit: 2 }),
    trend.dsBaselines(),
  );
  // One definition of previous, inside previousValues, and it now covers the
  // three DS measures as well as the two FM ones: they were split, and the DS
  // half kept reading the newest commit (#634).
  for (const name of [
    "fmUnexplainedCollapses",
    "fmUnownedModifiers",
    "oracleVerified",
    "oracleExamined",
    "unexplainedCollapses",
  ]) {
    assert.ok(name in prev, name + " has no previous value");
  }
});

test("the roll-up is dated by every source it reads, the FM tier's included", function () {
  const rollup = rollupOnce();
  const fmDate = trend.fmSourcesDate();
  assert.match(fmDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(rollup._meta.sourcesLastChangedAt >= fmDate, "sourcesLastChangedAt covers fm-base.css, the FM renderer and fmkit.json");
});

test("the markdown names both FM measures", function () {
  const md = trend.renderMarkdown(rollupOnce());
  assert.match(md, /FM variant values that render alike/);
  assert.match(md, /FM modifier classes with no rule/);
});

test("inline hex counts the fragments the manifest lists, never a stray file in the directory", function () {
  const fs = require("node:fs");
  const os = require("node:os");
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "hex-dist-"));
  fs.mkdirSync(path.join(dist, "fragments"));
  fs.writeFileSync(path.join(dist, "fragments", "listed.html"), '<div style="color:#ff0000">x</div>');
  fs.writeFileSync(path.join(dist, "fragments", "fossil.html"), '<div style="color:#00ff00">y</div>');
  fs.writeFileSync(path.join(dist, "render-manifest.json"), JSON.stringify({ renders: [{ slug: "listed", fragment: "fragments/listed.html" }] }));
  const hex = trend.inlineHex(dist);
  fs.rmSync(dist, { recursive: true, force: true });
  assert.deepEqual(hex, { value: 1, bySlug: { listed: 1 } }, "a fossil's hex must not count, or its prune reads as progress");
});
