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

  for (const name of ["unexplainedCollapses", "inlineHex", "oracleVerified"]) {
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

test("previous is the LAST COMMITTED value, because current is the fresh tree", function () {
  // The derive regenerates the dist and THEN this runs, so `current` is not yet
  // in the series: series[0] is the last committed measurement. Taking series[1]
  // skips a revision and misreports the direction outright. With the real
  // history 43 -> 65 -> 54, a fresh 54 against series[1]=43 reads "worse" when
  // the measure improved 65 -> 54, which is the exact failure this artifact
  // exists to prevent.
  const oracle = [{ verified: 78, examined: 408 }, { verified: 77, examined: 408 }];
  const collapses = [{ unexplained: 65 }, { unexplained: 43 }];

  const prev = trend.previousValues(oracle, collapses);

  assert.strictEqual(prev.oracleVerified, 78, "the last committed verified");
  assert.strictEqual(prev.unexplainedCollapses, 65, "the last committed collapses");
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
  const expected =
    oracleNewest > collapseNewest ? oracleNewest : collapseNewest;

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
