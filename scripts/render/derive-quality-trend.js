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
const fs = require("node:fs");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const collapse = require(path.join(__dirname, "lib", "variant-collapse.js"));
const BY_DESIGN = require(
  path.join(__dirname, "lib", "variant-collapse-by-design.js"),
);
const { deriveContract } = require(path.join(__dirname, "derive-contract.js"));
const fmCollapse = require(path.join(__dirname, "lib", "fm-collapse.js"));
const FM_BY_DESIGN = require(path.join(__dirname, "lib", "fm-collapse-by-design.js"));

// Unexplained variant collapses: values the renderer cannot tell apart and
// nobody has said why. A clamp hands back a different component than the caller
// asked for, so this is a correctness figure, not a polish one.
function unexplainedCollapses() {
  return collapse.classify(deriveContract(), BY_DESIGN).unexplained.length;
}

// The FM tier's collapses: axis values the FM renderer emits that read alike
// once the modifier classes fm-base.css does not style are removed. Sized at 35
// groups the day it joined (#554), which is why it is a dated measure with a
// direction here and not a gate: a gate over the tier would have been red on
// arrival, and the number nobody could see is how Secondary and Destructive
// buttons shipped unstyled. Same helper as the FM tests, so the roll-up and the
// tests cannot disagree.
let fmCensusOnce = null;
function fmCensus() {
  if (!fmCensusOnce) fmCensusOnce = fmCollapse.census();
  return fmCensusOnce;
}
function fmUnexplainedCollapses() {
  return collapse.classify(fmCensus().contract, FM_BY_DESIGN).unexplained.length;
}
// The direct #554 signal: modifier classes the FM renderer emits from a
// registry value with no rule that styles them. Published beside the collapse
// figure because a new unstyled value can leave the collapse count flat.
function fmUnownedModifiers() {
  return fmCensus().unownedModifiers.length;
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

// The SHAPE half, carried the same way and for the same reason. `mismatch` is
// published beside the pair because unlike the colour report, whose mismatch
// count is zero and blocks the build if it ever is not, this one starts with a
// real backlog: the check is new, it reports rather than blocks, and the number
// it reports is the work.
// 🪤 Same readFileSync-not-require caution as readOracle: this script runs after
// derive-geometry-fidelity.js has just rewritten the file.
function geometryFidelity() {
  const fs = require("node:fs");
  const t =
    JSON.parse(
      fs.readFileSync(
        path.join(
          REPO_ROOT,
          "components",
          "render",
          "dist",
          "geometry-report.json",
        ),
        "utf8",
      ),
    ).totals || {};
  return {
    verified: (t.verified || 0) + (t.verifiedViaTokenName || 0),
    examined: t.examined || 0,
    mismatch: t.mismatch || 0,
  };
}

// Bare hex in an inline `style` attribute: the parts of a fragment that cannot
// re-theme, against a tier doctrine of `var(--token, value)`.
//
// 🔑 SVG blocks are stripped FIRST and entirely, children included. A hex inside
// <svg> is a drawing instruction, not a theming decision, and conflating the two
// gives a number nobody can act on (31 theming against 160 artwork today).
// A hex sitting in a `var(--name, #hex)` fallback is the form the render tier's
// doctrine REQUIRES: the token themes the surface, the captured value stays as
// the fidelity fallback. Counting it made this measure unable to see its own
// fix, because converting `background:#eb0909` to
// `background:var(--zen-color-danger-50, #eb0909)` left the count identical.
// A measure that does not fall when the defect it names is repaired cannot
// drive the work it exists for, and #551 states the purpose as "cannot
// re-theme", which a var() fallback can.
// Case-insensitive because CSS function names are, and `[^()]*` keeps the match
// inside one var(), so a token used with no fallback cannot swallow the
// declaration after it and a nested fallback is blanked at the inner var().
//
// `[^()]*` rather than `[^)]*` is deliberate and the two agree on every fragment
// the repo has (a var() fallback containing a nested function is the only input
// that separates them, and there are none). Where they would differ, this form
// COUNTS where the looser one blanks, so the error is a reported violation
// rather than a hidden one. A burndown that errs should err toward showing work.
const VAR_FALLBACK = /var\(\s*--[A-Za-z0-9_-]+\s*,([^()]*)\)/gi;

function countInlineHex(html) {
  const withoutArtwork = String(html || "").replace(
    /<svg[\s\S]*?<\/svg>/gi,
    "",
  );
  let n = 0;
  // Both quote styles. No fragment uses single quotes today, so missing them
  // would be a false-clean waiting on a renderer change, not a wrong number now.
  const styles = withoutArtwork.match(/style=("[^"]*"|'[^']*')/gi) || [];
  for (const attr of styles) {
    // Blank the fallbacks rather than skipping the attribute: a style can carry
    // a tokenised colour and a bare one in the same declaration list, and
    // dropping the whole attribute would hide the bare one.
    const bareOnly = attr.replace(VAR_FALLBACK, "var(--t,)");
    n += (bareOnly.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  }
  return n;
}

// Summed across every committed fragment, with the per-fragment split kept so a
// reader knows WHERE to go rather than only how bad it is.
function inlineHex(distDir) {
  // Over the fragments the manifest LISTS, never over whatever the directory
  // holds: a fossil fragment counted here would make its eventual prune read
  // as "improving" (#520 review), the attrition shape the oracle pair exists
  // to expose. distDir is a parameter so the reader is testable without the
  // committed dist.
  const dist = distDir || path.join(REPO_ROOT, "components", "render", "dist");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dist, "render-manifest.json"), "utf8"),
  );
  const bySlug = {};
  let total = 0;
  (manifest.renders || []).forEach((r) => {
    const n = countInlineHex(
      fs.readFileSync(path.join(dist, r.fragment), "utf8"),
    );
    if (n > 0) bySlug[r.slug] = n;
    total += n;
  });
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
  structuralCollapses: "down",
  fmUnexplainedCollapses: "down",
  fmUnownedModifiers: "down",
  inlineHex: "down",
  oracleVerified: "up",
  oracleExamined: null, // neither direction is progress; it is context for the numerator
  // The shape half. Same reasoning as the colour pair: the numerator is what
  // moves with work, the denominator is context, and a ratio built from them
  // improves when declarations leave.
  geometryVerified: "up",
  geometryExamined: null,
  // Unlike the colour report's mismatch, this one is not zero and does not
  // block. It is the backlog, and down is the only direction that means work.
  geometryMismatch: "down",
};

// "unchanged" is a first-class answer, not a flavour of "better". A measure that
// has not moved in three weeks is the finding, and collapsing it into "not worse"
// is how a flat numerator passed for progress.
// A measure whose DEFINITION changed cannot be compared against its own
// history. `inlineHex` counted the hex inside a `var()` fallback until this
// epoch, so every earlier point counts correct code as broken and the drop from
// 57 to 47 is a redefinition, not work anybody did. Reporting that as "better"
// is the one output this artifact must never produce, so the epoch is written
// into the artifact and a baseline stamped with a different one is refused.
// Self-expiring: the next run's baseline carries the current epoch and the
// normal comparison resumes.
const DEFINITION_EPOCH = { inlineHex: "2026-09-07" };

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

// `cwd` exists so the baseline read can be exercised against a repository whose
// history a test controls. Nothing here writes, so it is a read confined to
// another tree rather than a producer pointed at one.
function git(args, cwd) {
  const { execFileSync } = require("node:child_process");
  return execFileSync("git", args, {
    cwd: cwd || REPO_ROOT,
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
// %cd, the COMMIT date, because that is what `git log` orders by. %ad is the
// author date, and the derive bots push with `git pull --rebase --autostash`,
// which moves commit dates relative to author dates. One rebased artifact commit
// is enough to emit a point whose date precedes its predecessor's and turn the
// ordering assertion red for a reason nobody can fix in the diff.
function commitDate(sha) {
  return git(["show", "-s", "--format=%cd", "--date=short", sha]).trim();
}

// A series that came back empty must say so. `git log` in a shallow clone
// SUCCEEDS with zero matching commits, so the soft failure is the dangerous
// one: the artifact would publish "Measured at null" with every direction
// "no baseline yet" and read as merely new rather than broken.
function assertSeries(series, name) {
  if (!series || series.length === 0) {
    throw new Error(
      "[quality-trend] the " +
        name +
        " series is EMPTY, so no measurement can be dated. This needs the full " +
        "history: a shallow checkout (fetch-depth 1) makes `git log` succeed " +
        "with no matching commits.",
    );
  }
  return series;
}

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
    const date = commitDate(sha);
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

// The half of the collapse census the capture can PROVE wrong, as opposed to
// the half where fixing is guessing. `unexplainedCollapses` counts every value
// that renders like a sibling with no by-design entry; this counts only those
// the capture records as a different SHAPE, quoting both child lists. It is the
// actionable subset, and it is the number to work down: a fall here is a
// component that now draws what Figma says it is, where a fall in the parent
// figure can also be a new by-design exemption.
function structuralCollapses() {
  const S = require("./lib/structural-evidence.js");
  const hits = S.unrenderedStructural(deriveContract(), BY_DESIGN);
  return {
    value: hits.length,
    // The KEYS, not just the count, because the ratchet compares SETS. A count
    // is satisfied by fixing one value and breaking another, and a swap is the
    // regression a burndown is least likely to notice by eye.
    keys: hits.map(function (h) {
      return h.key;
    }),
  };
}

function currentMeasures() {
  return {
    unexplainedCollapses: {
      value: unexplainedCollapses(),
    },
    structuralCollapses: structuralCollapses(),
    fmUnexplainedCollapses: {
      value: fmUnexplainedCollapses(),
    },
    fmUnownedModifiers: {
      value: fmUnownedModifiers(),
    },
    oracleCoverage: oracleCoverage(),
    geometryFidelity: geometryFidelity(),
    inlineHex: inlineHex(),
  };
}

// The collapse figure at each committed revision of the contract, computed by
// running TODAY's classifier over the historical artifact. Same helper as the
// current figure and as the gate, so a point in the series can never disagree
// with what the gate would have said about that tree.
const CONTRACT_REL = "components/render/dist/render-contract.json";

function collapseSeries(opts) {
  const limit = (opts && opts.limit) || 12;
  const shas = git(["log", "--format=%H", "-" + limit, "--", CONTRACT_REL])
    .split("\n")
    .filter(Boolean);
  const points = [];
  for (const sha of shas) {
    const contract = showJson(sha, CONTRACT_REL);
    if (!contract) continue;
    const pkg = showJson(sha, "package.json") || {};
    const date = commitDate(sha);
    points.push({
      date: date,
      version: pkg.version || "0.0.0",
      sha: sha.slice(0, 8),
      unexplained: collapse.classify(contract, BY_DESIGN).unexplained.length,
    });
  }
  return points;
}

// Previous committed value of each measure, so `direction` has something to
// compare against. Oracle comes from its own artifact's history; the other two
// come from the contract and the fragments at the same revisions.
// Takes the series it needs rather than re-running git for them: buildRollup
// already has both, and each call is a subprocess per revision.
// 🔑 [0], not [1]. This runs AFTER the derive has regenerated the dist, so the
// value being reported is the fresh working tree and is NOT yet in the series:
// series[0] is the last COMMITTED measurement, which is exactly what "previous"
// means here. Taking [1] skipped a revision, and with the real collapse history
// 43 -> 65 -> 54 a fresh 54 against [1]=43 reported "worse" for a measure that
// had improved 65 -> 54. Reporting a regression as progress is the one thing
// this artifact must never do.
// EVERY measure's baseline is this artifact's state at the MERGE BASE with
// main, never at the latest commit. `render-derive.yml` triggers on
// `paths-manifest.json` and its own auto-commit bumps that file, so the
// workflow re-fires on the bot's commit and runs a second time with that commit
// as HEAD. "The last commit that touched the artifact" is then THIS RUN'S OWN
// OUTPUT, so a figure that moved reports `unchanged (was <the new value>)`, the
// artifact differs again, and a second bump ships for nothing. Observed as a
// re-fire on both PRs of 2026-09-02 (#634).
//
// The FM measures were given the merge base when they were added; the three DS
// measures kept reading series[0] and are the reason this comment now covers
// all of them.
const TREND_REL = "components/render/dist/quality-trend.json";
function baselineRef(cwd) {
  let base;
  try {
    base = git(["merge-base", "HEAD", "origin/main"], cwd).trim();
  } catch (e) {
    // Never fall back to HEAD here. HEAD is precisely the value that reports a
    // run its own output back, so a silent fallback would restore the defect
    // this function exists to remove, on a green run, with no trace.
    throw new Error(
      "[quality-trend] cannot locate the merge base with origin/main, so no " +
        "measure has an honest baseline. This needs the ref and the history: a " +
        "shallow checkout, or one with no origin/main, cannot produce it.",
    );
  }
  return base || "HEAD";
}
// Any measure's last COMMITTED value, read out of this artifact at the merge
// base. Named for the FM measures it was written for, which hid that it is
// generic and left `inlineHex` hard-coded to null for weeks while the read it
// said it was waiting for sat one call away.
function previousMeasure(name) {
  const committed = showJson(baselineRef(), TREND_REL);
  const m = committed && committed.measures && committed.measures[name];
  if (!m || typeof m.value !== "number") return null;
  // Comparable only if the baseline was measured under the same definition.
  if ((m.definitionEpoch || null) !== (DEFINITION_EPOCH[name] || null)) {
    return null;
  }
  return m.value;
}

// The revisions of `rel` the baseline can see, newest first, abbreviated to the
// width the series points carry. Read from the baseline rather than from HEAD,
// so a commit the bot pushed onto this branch is simply not in the set.
function baselineShas(rel, limit, cwd) {
  return git(
    ["log", "--format=%H", "-" + (limit || 24), baselineRef(cwd), "--", rel],
    cwd,
  )
    .split("\n")
    .filter(Boolean)
    .map(function (sha) {
      return sha.slice(0, 8);
    });
}

// The newest series point the baseline can see.
//
// 🔑 The first MATCH, not [1]. On main and on a PR's first run the baseline
// sees series[0] and this returns it, which is what "previous" means: the
// derive regenerates the dist and THEN this runs, so the current value is not
// yet in the series and series[0] is the last committed measurement. Taking
// [1] unconditionally skipped a revision, and against the real collapse
// history 43 -> 65 -> 54 a fresh 54 compared to 43 read "worse" for a measure
// that had improved. Reporting a regression as progress is the one thing this
// artifact must never do.
//
// Returns null when the baseline can see none of them, which surfaces as "no
// baseline yet" rather than as a fabricated comparison.
function firstAtOrBefore(series, shas) {
  const visible = new Set(shas || []);
  for (const point of series || []) {
    if (visible.has(point.sha)) return point;
  }
  return null;
}
// The FM tier is dated by its own sources, not by the oracle's or the
// contract's commits: fm-base.css moved the figure 35 -> 34 on a day neither of
// those files changed.
function fmSourcesDate() {
  return git(["log", "-1", "--format=%cs", "--"].concat(fmCollapse.SOURCES)).trim();
}

// `baseline` names, per DS series, the revisions the merge base can see. It is
// REQUIRED: an optional baseline would let a caller drop it and silently get
// the newest commit back, which is the whole defect. Callers get a named
// failure instead.
// The ONE place the DS baselines are constructed. Both series in one function
// named for what it returns, so a caller cannot assemble a plausible-looking
// baseline out of HEAD's revisions by hand.
function dsBaselines(cwd) {
  return {
    oracle: baselineShas(FIDELITY_REL, 24, cwd),
    collapses: baselineShas(CONTRACT_REL, 24, cwd),
  };
}

function previousValues(oracle, collapses, baseline) {
  if (!baseline || !baseline.oracle || !baseline.collapses) {
    throw new Error(
      "[quality-trend] previousValues needs the baseline revisions of both DS " +
        "series. Without them it would fall back to the newest commit, which on " +
        "a PR's second derive run is this run's own output.",
    );
  }
  const prev = firstAtOrBefore(oracle, baseline.oracle);
  const prevCollapse = firstAtOrBefore(collapses, baseline.collapses);
  return {
    fmUnexplainedCollapses: previousMeasure("fmUnexplainedCollapses"),
    fmUnownedModifiers: previousMeasure("fmUnownedModifiers"),
    oracleVerified: prev ? prev.verified : null,
    oracleExamined: prev ? prev.examined : null,
    unexplainedCollapses: prevCollapse ? prevCollapse.unexplained : null,
    // Read from the committed artifact, the same way the two FM measures above
    // are.
    //
    // This was hard-coded `null` on the reasoning that inline hex "needs every
    // fragment at a historical revision rather than one file". True if the
    // figure is recomputed from history, and unnecessary: the derive commits
    // its own value into THIS file, so the previous measurement is one
    // `previousMeasure` call away and always has been for the FM pair.
    //
    // What the placeholder cost: inline hex went 28 to 57 between v0.34.135 and
    // 2026-09-07, the largest movement of any measure here, and the burndown
    // reported `unknown` throughout. This artifact exists because every gate in
    // the render tier is a ratchet that cannot report a direction, and the one
    // measure it could not report on is the one that doubled. Both of those
    // figures are under the pre-epoch definition, which counted a var()
    // fallback; DEFINITION_EPOCH is why they are not compared against today's.
    inlineHex: previousMeasure("inlineHex"),
    // Same read as the other committed measures. It has no historical series of
    // its own and does not need one: the artifact carries its own last value.
    structuralCollapses: previousMeasure("structuralCollapses"),
    // The geometry trio, read from this artifact's own last committed value the
    // way inlineHex and structuralCollapses are. No git series of its own: the
    // report it reads did not exist before this measure did, so a series
    // reconstructed from history would be entirely empty and its absence would
    // read as "no baseline yet" forever.
    geometryVerified: previousMeasure("geometryVerified"),
    geometryExamined: previousMeasure("geometryExamined"),
    geometryMismatch: previousMeasure("geometryMismatch"),
  };
}

function buildRollup() {
  const series = assertSeries(oracleSeries({ limit: 12 }), "oracle");
  const collapses = assertSeries(collapseSeries({ limit: 12 }), "collapse");
  const fmDate = fmSourcesDate();
  const newestSourceDate = [series[0].date, collapses[0].date, fmDate]
    .filter(Boolean)
    .sort()
    .pop();
  const current = currentMeasures();
  const prev = previousValues(series, collapses, dsBaselines());

  const values = {
    unexplainedCollapses: current.unexplainedCollapses.value,
    structuralCollapses: current.structuralCollapses.value,
    fmUnexplainedCollapses: current.fmUnexplainedCollapses.value,
    fmUnownedModifiers: current.fmUnownedModifiers.value,
    inlineHex: current.inlineHex.value,
    oracleVerified: current.oracleCoverage.verified,
    oracleExamined: current.oracleCoverage.examined,
    geometryVerified: current.geometryFidelity.verified,
    geometryExamined: current.geometryFidelity.examined,
    geometryMismatch: current.geometryFidelity.mismatch,
  };

  const measures = {};
  for (const name of Object.keys(values)) {
    measures[name] = {
      value: values[name],
      direction: direction(name, values[name], prev[name]),
      previous: prev[name],
      // Only on a measure that has one, so the artifact does not carry a null
      // field for every measure whose definition has never moved.
      ...(DEFINITION_EPOCH[name]
        ? { definitionEpoch: DEFINITION_EPOCH[name] }
        : {}),
    };
  }

  return {
    _meta: {
      auto_generated: true,
      source: "scripts/render/derive-quality-trend.js",
      do_not_edit:
        "Regenerate with `npm run derive:render`. Hand edits are overwritten.",
      // The rule this artifact serves: a reported number must be DERIVED and
      // DATED. Never the wall clock: an artifact stamped with `new Date()`
      // changes every day whether or not anything it measures did, which turns
      // the derive's "did the dist change" gate into always-true and takes a
      // version bump on every PR for nothing.
      //
      // The newest revision of ANY source read, not the oracle's alone: the
      // collapse and hex figures come from the contract and the fragments and
      // have no relationship to the fidelity report's commit, so dating the
      // whole table by that one was wrong.
      //
      // NO version field. package.json is read here, and render-derive.yml
      // bumps it AFTER this runs and commits both together, so the file
      // released as vN+1 would state vN. The series points read package.json at
      // each commit, i.e. post-bump, so the two would be different conventions
      // printed side by side.
      sourcesLastChangedAt: newestSourceDate,
    },
    measures: measures,
    detail: {
      inlineHexBySlug: current.inlineHex.bySlug,
      structuralCollapseKeys: current.structuralCollapses.keys,
      fmUnownedModifiers: fmCensus().unownedModifiers,
      fmOwnedNotEmitted: fmCensus().ownedNotEmitted,
      fmUnrendered: fmCensus().unrendered,
    },
    oracleSeries: series,
    collapseSeries: collapses,
  };
}

const LABELS = {
  unexplainedCollapses: "Unexplained variant collapses",
  structuralCollapses:
    "...of those, ones the capture proves are a different shape",
  fmUnexplainedCollapses: "FM variant values that render alike (unexplained)",
  fmUnownedModifiers: "FM modifier classes with no rule",
  inlineHex: "Inline-style hex (cannot re-theme)",
  oracleVerified: "Verified colour declarations (oracle numerator)",
  oracleExamined: "Examined colour declarations (oracle denominator)",
  geometryVerified: "Verified shape declarations (geometry numerator)",
  geometryExamined: "Examined shape declarations (geometry denominator)",
  geometryMismatch: "Shape declarations the capture contradicts",
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
  lines.push("# Output quality");
  lines.push("");
  // Visible, matching components/dist/guidelines/coverage.md. An HTML comment
  // disappears on render, and this file exists to be PASTED into a report: the
  // reader has to be able to see that the numbers are generated and that a hand
  // edit will be overwritten.
  lines.push(
    "> Auto-generated by `scripts/render/derive-quality-trend.js`. Do not edit. " +
      "Regenerate with `npm run derive:render`.",
  );
  lines.push("");
  lines.push(
    "Sources last changed **" +
      rollup._meta.sourcesLastChangedAt +
      "**. Values are derived from the tree this ran against.",
  );
  lines.push("");
  lines.push("| Measure | Value | Since last change |");
  lines.push("| --- | --- | --- |");
  for (const name of Object.keys(m)) {
    const prev = m[name].previous;
    // "no baseline yet" would be a lie on a measure that has twenty of them and
    // is refusing to compare across a definition change. A reader who cannot
    // tell those two apart reads a redefinition as a fresh measure.
    // `prev == null` is the refusal's actual signature, not `direction ===
    // "unknown"`: direction is also unknown when the CURRENT value is missing,
    // and blaming that on a definition change would state a cause this line
    // never checked.
    const since =
      prev == null && m[name].definitionEpoch
        ? "definition changed " + m[name].definitionEpoch + ", not comparable"
        : ARROW[m[name].direction] + (prev == null ? "" : " (was " + prev + ")");
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
  lines.push(
    "Geometry coverage is **" +
      m.geometryVerified.value +
      " of " +
      m.geometryExamined.value +
      "** gap, padding and fixed-height declarations, with **" +
      m.geometryMismatch.value +
      "** the capture contradicts. That last number is a worklist, not a " +
      "verdict: a disagreement can mean the CSS has the shape wrong, that the " +
      "renderer flattened a structure Figma splits across nested frames, or " +
      "that the Figma component itself is off the spacing scale. The check " +
      "reports; `tests/render/geometry-ratchet.test.js` is what keeps the " +
      "number falling.",
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

  // The collapse arc, for the same reason as the oracle's: this measure swings
  // hardest in real history (43 -> 65 -> 54 across three weeks) and is the one a
  // reader acts on first, so a single-step delta misleads worst here.
  const collapses = rollup.collapseSeries || [];
  if (collapses.length) {
    lines.push("## Unexplained collapses over time");
    lines.push("");
    lines.push("| Date | Version | Unexplained |");
    lines.push("| --- | --- | --- |");
    for (const p of collapses) {
      lines.push(
        "| " + p.date + " | v" + p.version + " | " + p.unexplained + " |",
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
  inlineHex: inlineHex,
  assertSeries: assertSeries,
  readOracle: readOracle,
  previousValues: previousValues,
  baselineRef: baselineRef,
  // Read-only, exported so a test can compare previousValues against the
  // committed artifact rather than against a list of measure names.
  showJson: showJson,
  baselineShas: baselineShas,
  dsBaselines: dsBaselines,
  firstAtOrBefore: firstAtOrBefore,
  fmSourcesDate: fmSourcesDate,
  direction: direction,
  oracleSeries: oracleSeries,
  collapseSeries: collapseSeries,
  buildRollup: buildRollup,
  renderMarkdown: renderMarkdown,
  GOOD_DIRECTION: GOOD_DIRECTION,
  DEFINITION_EPOCH: DEFINITION_EPOCH,
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
    "[quality-trend] sources last changed " +
      rollup._meta.sourcesLastChangedAt +
      ": " +
      m.unexplainedCollapses.value +
      " unexplained collapses (" +
      m.structuralCollapses.value +
      " structurally proven), " +
      m.fmUnexplainedCollapses.value +
      " FM collapsed groups, " +
      m.fmUnownedModifiers.value +
      " FM unowned modifiers, " +
      m.inlineHex.value +
      " inline hex, oracle " +
      m.oracleVerified.value +
      " of " +
      m.oracleExamined.value +
      "\n",
  );
}
