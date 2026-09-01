"use strict";

// Derives the output-quality roll-up: the measures that say whether a generated
// screen can be trusted, each with the value, the date it was measured, and the
// direction it has moved.
//
// Why this exists: every one of these measures already had a gate, and every
// gate is a RATCHET. A ratchet blocks a regression on a value the baseline
// already knows and skips what it cannot recognise (a new slug, a new value),
// which is correct for gating and useless for reporting. So the numbers drifted
// the wrong way for three weeks with CI green throughout.
//
// The rule it serves: a reported number must be DERIVED and DATED.
//
// 🔑 Nothing here recomputes a measure a gate already owns. Each one calls the
// gate's own helper. A re-count of the contract's `rendersAs` keys returns 106
// where the gate reports 61, because it knows nothing about State-axis
// exclusion or equivalence classes, and a roll-up that drifts from its gate is
// worse than no roll-up: it is quotable and wrong.

const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const collapse = require(path.join(__dirname, "lib", "variant-collapse.js"));
const BY_DESIGN = require(
  path.join(__dirname, "lib", "variant-collapse-by-design.js"),
);
const { deriveContract } = require(path.join(__dirname, "derive-contract.js"));

// Unexplained variant collapses: values the renderer cannot tell apart and
// nobody has said why. A clamp hands back a different component than the caller
// asked for, so this is a correctness figure, not a polish one.
function unexplainedCollapses() {
  return collapse.classify(deriveContract(), BY_DESIGN).unexplained.length;
}

// Oracle coverage, carried as the pair rather than the ratio.
//
// 🔑 The ratio alone is misleading and has already misled: it went 17.81% (75 of
// 438) to 19.12% (75 of 408) between 2026-08-12 and 2026-09-01 with the
// numerator FLAT. Every point of that "improvement" was declarations leaving
// the denominator. Carrying both makes attrition visible in the number itself.
// 🪤 readFileSync, never require(). require() memoises, and this script runs
// LAST in the derive chain, immediately after fidelity-check.js rewrites the
// report it reads. A cached read is exactly the stale number the artifact
// exists to stop anyone quoting. The path is a parameter so the reader is
// testable without touching the committed dist.
function readOracle(reportPath) {
  const fs = require("node:fs");
  const t = JSON.parse(fs.readFileSync(reportPath, "utf8")).totals || {};
  return {
    verified: (t.verified || 0) + (t.verifiedViaTokenName || 0),
    examined: t.examined || 0,
  };
}

function oracleCoverage() {
  return readOracle(
    path.join(REPO_ROOT, "components", "render", "dist", "fidelity-report.json"),
  );
}

// Bare hex in an inline `style` attribute: the parts of a fragment that cannot
// re-theme, against a tier doctrine of `var(--token, value)`.
//
// 🔑 SVG blocks are stripped FIRST and entirely, children included. A hex inside
// <svg> is a drawing instruction, not a theming decision, and conflating the two
// gives a number nobody can act on (31 theming against 160 artwork today).
function countInlineHex(html) {
  const withoutArtwork = String(html || "").replace(
    /<svg[\s\S]*?<\/svg>/gi,
    "",
  );
  let n = 0;
  const styles = withoutArtwork.match(/style="[^"]*"/gi) || [];
  for (const attr of styles) {
    n += (attr.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  }
  return n;
}

// Summed across every committed fragment, with the per-fragment split kept so a
// reader knows WHERE to go rather than only how bad it is.
function inlineHex() {
  const fs = require("node:fs");
  const dir = path.join(REPO_ROOT, "components", "render", "dist", "fragments");
  const bySlug = {};
  let total = 0;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!/\.html?$/i.test(file)) continue;
    const n = countInlineHex(fs.readFileSync(path.join(dir, file), "utf8"));
    if (n > 0) {
      bySlug[file.replace(/\.html?$/i, "")] = n;
      total += n;
    }
  }
  return { value: total, bySlug: bySlug };
}

// Which way is progress, per measure. Declared rather than inferred, because
// the two directions genuinely differ and guessing gets it backwards: FEWER
// unexplained collapses is progress, FEWER verified declarations is not.
//
// 🔑 `oracleVerified` is the numerator on purpose. Tracking the RATIO here would
// reproduce the defect this artifact exists to expose, since the ratio improves
// when the denominator shrinks.
const GOOD_DIRECTION = {
  unexplainedCollapses: "down",
  inlineHex: "down",
  oracleVerified: "up",
  oracleExamined: null, // neither direction is progress; it is context for the numerator
};

// "unchanged" is a first-class answer, not a flavour of "better". A measure that
// has not moved in three weeks is the finding, and collapsing it into "not worse"
// is how a flat numerator passed for progress.
function direction(measure, current, previous) {
  if (previous == null || current == null) return "unknown";
  if (current === previous) return "unchanged";
  const good = GOOD_DIRECTION[measure];
  if (!good) return "changed";
  const rose = current > previous;
  return (good === "up") === rose ? "better" : "worse";
}

// The series comes out of git, because it is ALREADY THERE. Both metric
// artifacts are committed, so their history is a retroactive series for free and
// no new store is needed. That is the whole reason this stayed a derive rather
// than becoming a metrics subsystem.
//
// One point per COMMIT that changed the artifact, newest first. Commits rather
// than tags because not every release changes a measure, and a point that
// repeats the previous value teaches nothing.
const FIDELITY_REL = "components/render/dist/fidelity-report.json";

function git(args) {
  const { execFileSync } = require("node:child_process");
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 1 << 28,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

// Returns null for a revision this cannot read: an artifact that predates the
// field, or a shape that has since changed. Skipping such a point is right, but
// it is also a silent-absence path, so if EVERY revision were skipped the series
// would come back empty and every direction would read "unknown" rather than
// failing. The non-empty assertion in tests/render/quality-trend.test.js is what
// makes that loud, and it is the reason that test exists.
function showJson(sha, rel) {
  try {
    return JSON.parse(git(["show", sha + ":" + rel]));
  } catch (e) {
    return null;
  }
}

function oracleSeries(opts) {
  const limit = (opts && opts.limit) || 12;
  const shas = git(["log", "--format=%H", "-" + limit, "--", FIDELITY_REL])
    .split("\n")
    .filter(Boolean);
  const points = [];
  for (const sha of shas) {
    const report = showJson(sha, FIDELITY_REL);
    if (!report || !report.totals) continue;
    const pkg = showJson(sha, "package.json") || {};
    const date = git([
      "show",
      "-s",
      "--format=%ad",
      "--date=short",
      sha,
    ]).trim();
    const t = report.totals;
    points.push({
      date: date,
      version: pkg.version || "0.0.0",
      sha: sha.slice(0, 8),
      verified: (t.verified || 0) + (t.verifiedViaTokenName || 0),
      examined: t.examined || 0,
    });
  }
  return points;
}

function currentMeasures() {
  return {
    unexplainedCollapses: {
      value: unexplainedCollapses(),
    },
    oracleCoverage: oracleCoverage(),
    inlineHex: inlineHex(),
  };
}

// Previous committed value of each measure, so `direction` has something to
// compare against. Oracle comes from its own artifact's history; the other two
// come from the contract and the fragments at the same revisions.
function previousValues() {
  const series = oracleSeries({ limit: 2 });
  const prev = series.length > 1 ? series[1] : null;
  return {
    oracleVerified: prev ? prev.verified : null,
    oracleExamined: prev ? prev.examined : null,
    // Collapses and hex are derived from artifacts whose history is shallower
    // and whose helpers must run against a historical tree. v1 leaves them
    // unknown rather than guessing: "unknown" is honest and visible, and a
    // fabricated baseline would make the first report read as progress.
    unexplainedCollapses: null,
    inlineHex: null,
  };
}

function buildRollup() {
  const pkg = JSON.parse(
    require("node:fs").readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
  );
  const series = oracleSeries({ limit: 12 });
  const current = currentMeasures();
  const prev = previousValues();

  const values = {
    unexplainedCollapses: current.unexplainedCollapses.value,
    inlineHex: current.inlineHex.value,
    oracleVerified: current.oracleCoverage.verified,
    oracleExamined: current.oracleCoverage.examined,
  };

  const measures = {};
  for (const name of Object.keys(values)) {
    measures[name] = {
      value: values[name],
      direction: direction(name, values[name], prev[name]),
      previous: prev[name],
    };
  }

  return {
    _meta: {
      auto_generated: true,
      source: "scripts/render/derive-quality-trend.js",
      do_not_edit:
        "Regenerate with `npm run derive:render`. Hand edits are overwritten.",
      // The rule this artifact serves: a reported number must be DERIVED and
      // DATED. The date is the newest SOURCE revision's, never the wall clock:
      // an artifact stamped with `new Date()` changes every day whether or not
      // anything it measures did, which turns the derive's "did the dist
      // change" gate into always-true and takes a version bump on every PR for
      // nothing. Stable inputs must produce byte-identical output.
      measuredAt: series.length ? series[0].date : null,
      version: pkg.version,
    },
    measures: measures,
    detail: {
      inlineHexBySlug: current.inlineHex.bySlug,
    },
    oracleSeries: series,
  };
}

const LABELS = {
  unexplainedCollapses: "Unexplained variant collapses",
  inlineHex: "Inline-style hex (cannot re-theme)",
  oracleVerified: "Verified declarations (oracle numerator)",
  oracleExamined: "Examined declarations (oracle denominator)",
};

const ARROW = {
  better: "improving",
  worse: "regressing",
  unchanged: "flat",
  unknown: "no baseline yet",
  changed: "changed",
};

// The pasteable half. Reporting in this ecosystem is currently a screenshot,
// because nothing in the substrate exports; this is the artifact a person can
// put in front of the team without re-deriving anything.
function renderMarkdown(rollup) {
  const m = rollup.measures;
  const lines = [];
  lines.push("<!-- AUTO-GENERATED - DO NOT EDIT. Regenerate with `npm run derive:render`. -->");
  lines.push("");
  lines.push("# Output quality");
  lines.push("");
  lines.push(
    "Measured at **" +
      rollup._meta.measuredAt +
      "**, knowledge **v" +
      rollup._meta.version +
      "**.",
  );
  lines.push("");
  lines.push("| Measure | Value | Since last change |");
  lines.push("| --- | --- | --- |");
  for (const name of Object.keys(m)) {
    const prev = m[name].previous;
    const since =
      ARROW[m[name].direction] + (prev == null ? "" : " (was " + prev + ")");
    lines.push(
      "| " + LABELS[name] + " | " + m[name].value + " | " + since + " |",
    );
  }
  lines.push("");
  // Printed as a pair, never as a percentage. The ratio rose from 17.81% to
  // 19.12% between 2026-08-12 and 2026-08-31 with the numerator FLAT, so the
  // percentage reports attrition as progress.
  lines.push(
    "Oracle coverage is **" +
      m.oracleVerified.value +
      " of " +
      m.oracleExamined.value +
      "** declarations. It is stated as a pair on purpose: the ratio improves " +
      "when declarations leave the denominator, which is not progress.",
  );
  lines.push("");
  // The arc, not just the last step. A single-step delta told the reader
  // "improving (was 77)" about a number that has been 78 since 2026-08-12,
  // because 77 was one transient commit. Printing the dated series is what
  // makes a flat numerator legible as flat.
  const series = rollup.oracleSeries || [];
  if (series.length) {
    lines.push("## Oracle numerator over time");
    lines.push("");
    lines.push("| Date | Version | Verified | Examined |");
    lines.push("| --- | --- | --- | --- |");
    for (const p of series) {
      lines.push(
        "| " +
          p.date +
          " | v" +
          p.version +
          " | " +
          p.verified +
          " | " +
          p.examined +
          " |",
      );
    }
    lines.push("");
  }

  const hex = rollup.detail.inlineHexBySlug || {};
  const slugs = Object.keys(hex).sort(function (a, b) {
    return hex[b] - hex[a];
  });
  if (slugs.length) {
    lines.push("## Where the inline hex is");
    lines.push("");
    for (const slug of slugs) {
      lines.push("- `" + slug + "` " + hex[slug]);
    }
    lines.push("");
  }
  return lines.join("\n");
}

module.exports = {
  REPO_ROOT: REPO_ROOT,
  currentMeasures: currentMeasures,
  countInlineHex: countInlineHex,
  readOracle: readOracle,
  direction: direction,
  oracleSeries: oracleSeries,
  buildRollup: buildRollup,
  renderMarkdown: renderMarkdown,
  GOOD_DIRECTION: GOOD_DIRECTION,
};

// CLI: writes both halves. Runs LAST in the derive:render chain, after
// fidelity-check.js has rewritten the report it reads, so the roll-up can never
// quote a stale numerator.
if (require.main === module) {
  const fs = require("node:fs");
  const outDir = path.join(REPO_ROOT, "components", "render", "dist");
  const rollup = buildRollup();

  fs.writeFileSync(
    path.join(outDir, "quality-trend.json"),
    JSON.stringify(rollup, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(outDir, "quality-trend.md"),
    renderMarkdown(rollup) + "\n",
    "utf8",
  );

  const m = rollup.measures;
  process.stdout.write(
    "[quality-trend] " +
      rollup._meta.measuredAt +
      " v" +
      rollup._meta.version +
      ": " +
      m.unexplainedCollapses.value +
      " unexplained collapses, " +
      m.inlineHex.value +
      " inline hex, oracle " +
      m.oracleVerified.value +
      " of " +
      m.oracleExamined.value +
      "\n",
  );
}
