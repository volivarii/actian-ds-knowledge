// The tree-pure half of quality-trend.json, asserted against regeneration.
//
// The whole file cannot go under the render dist byte-drift guard, because it
// is a function of the repository's HISTORY and not of the tree:
//
//   - every measure's `direction`/`previous` is read at
//     `merge-base HEAD origin/main`, so once the PR that wrote the file merges,
//     its own commit becomes the baseline and regeneration answers
//     "unchanged (was <the new value>)";
//   - every series point records the SHA of the commit that produced it, and
//     package.json AT that SHA. Squash merge deletes those commits outright.
//
// What IS a function of the tree is what the artifact exists to report: each
// measure's `value`, and the `detail` census those values are counted from.
// Nothing else asserts them. The #571 probe that motivated the drift guard
// mutated every committed render artifact and found quality-trend.json stayed
// GREEN under the whole suite, so without this the exemption would drop the
// numbers guard in silence.
//
// Runs AFTER `npm run derive:render`: the working tree holds the regenerated
// file, `git show HEAD:` holds the committed one.
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { isDeepStrictEqual } = require("node:util");

const REL = "components/render/dist/quality-trend.json";

/** Disagreements on the half of the trend that regeneration must reproduce.
 *  Walks the UNION of measure keys, not the committed side alone: iterating
 *  one side lets a renamed or dropped measure vanish with no complaint, and
 *  absence does not state its cause. */
function treePureDiff(committed, fresh) {
  const out = [];

  const cm = (committed && committed.measures) || {};
  const fm = (fresh && fresh.measures) || {};
  const measureKeys = [
    ...new Set([...Object.keys(cm), ...Object.keys(fm)]),
  ].sort();
  for (const key of measureKeys) {
    const c = cm[key];
    const f = fm[key];
    if (!c) {
      out.push(
        `measures.${key}: absent from the committed file, ${JSON.stringify(f && f.value)} when regenerated`,
      );
      continue;
    }
    if (!f) {
      out.push(
        `measures.${key}: ${JSON.stringify(c.value)} committed, absent when regenerated`,
      );
      continue;
    }
    if (!isDeepStrictEqual(c.value, f.value)) {
      out.push(
        `measures.${key}.value: ${JSON.stringify(c.value)} committed, ${JSON.stringify(f.value)} regenerated`,
      );
    }
  }

  const cd = (committed && committed.detail) || {};
  const fd = (fresh && fresh.detail) || {};
  const detailKeys = [
    ...new Set([...Object.keys(cd), ...Object.keys(fd)]),
  ].sort();
  for (const key of detailKeys) {
    if (!isDeepStrictEqual(cd[key], fd[key])) {
      out.push(`detail.${key}: committed and regenerated disagree`);
    }
  }

  return out;
}

function main() {
  let committedRaw;
  try {
    committedRaw = execFileSync("git", ["show", "HEAD:" + REL], {
      encoding: "utf8",
    });
  } catch (e) {
    // An unreadable baseline is a broken query, not "nothing to compare".
    // Passing here would be a silent green on a required check.
    console.error(
      `::error::cannot read ${REL} at HEAD, so the trend's numbers cannot be checked: ${e.message}`,
    );
    process.exit(1);
  }

  const committed = JSON.parse(committedRaw);
  const fresh = JSON.parse(readFileSync(REL, "utf8"));

  const found = treePureDiff(committed, fresh);
  const measureCount = Object.keys(committed.measures || {}).length;
  const detailCount = Object.keys(committed.detail || {}).length;

  if (found.length > 0) {
    console.error(
      `::error::${REL} reports numbers that regeneration does not produce. Run 'npm run derive:render' and commit the VALUE changes. Do not commit the direction/previous or series churn that comes with them, it is history-relative and this guard exempts it.`,
    );
    for (const line of found) console.error("  " + line);
    process.exit(1);
  }

  console.log(
    `quality-trend numbers are current: ${measureCount} measures and ${detailCount} detail censuses match regeneration ` +
      `(direction/previous and the series are history-relative and deliberately not compared).`,
  );
}

if (require.main === module) main();

module.exports = { treePureDiff, REL };
