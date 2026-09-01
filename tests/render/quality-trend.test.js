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
  const rollup = trend.buildRollup();

  assert.match(
    rollup._meta.measuredAt,
    /^\d{4}-\d{2}-\d{2}$/,
    "the roll-up is dated",
  );
  assert.match(
    rollup._meta.version,
    /^\d+\.\d+\.\d+$/,
    "the roll-up names the version it measured",
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
  const rollup = trend.buildRollup();
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
  const md = trend.renderMarkdown(trend.buildRollup());

  assert.match(md, /AUTO-GENERATED/, "carries the generated banner");
  assert.match(md, /\d{4}-\d{2}-\d{2}/, "states the date it was measured");
  assert.match(md, /unexplained variant collapses/i);
  assert.match(md, /verified declarations/i);
  assert.match(md, /inline-style hex/i);
});

test("the markdown reports the oracle pair, never a bare percentage", function () {
  // A bare percentage is the one form this measure must not be published in:
  // it rose from 17.81% to 19.12% while nothing more became verifiable.
  const md = trend.renderMarkdown(trend.buildRollup());
  const rollup = trend.buildRollup();

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
  const rollup = trend.buildRollup();
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
  const first = trend.renderMarkdown(trend.buildRollup());
  const second = trend.renderMarkdown(trend.buildRollup());
  assert.strictEqual(first, second, "two runs agree");

  const rollup = trend.buildRollup();
  const newest = rollup.oracleSeries[0];
  assert.strictEqual(
    rollup._meta.measuredAt,
    newest.date,
    "the date is the newest source revision's date, not today's wall clock",
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
